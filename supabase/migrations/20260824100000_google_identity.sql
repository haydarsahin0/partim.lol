-- Google ile giriş: hesap cihaza değil kimliğe bağlansın.
--
-- NEDEN
--
-- Hesaplar şimdiye kadar yalnızca cihaza bağlıydı: tarayıcı verisi silinirse
-- ya da kullanıcı başka bir cihaza geçerse hesap (ve satın alımları) geride
-- kalıyordu. Kurtarma kodu vardı ama kimse kodunu saklamıyor.
--
-- Artık oturumun kimliği (Google) bir profile bağlanıyor. Aynı Google hesabı
-- hangi cihazdan girerse girsin aynı profile düşüyor.

/*
 * Kimlik → profil eşlemesi.
 *
 * E-POSTA BURADA SAKLANMIYOR. profiles tablosunu herkes okuyabiliyor ve bu
 * tablo da onunla aynı veritabanında; kimliği e-postanın SHA-256 özeti olarak
 * tutuyoruz. Eşleme için yeterli, kimseye kullanıcının adresini vermiyor.
 *
 * RLS açık ve hiçbir politika yok: doğrudan kimse okuyamıyor/yazamıyor,
 * yalnızca aşağıdaki SECURITY DEFINER fonksiyon dokunuyor.
 */
create table if not exists public.profile_identities (
  provider   text not null,
  subject    text not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, subject)
);

alter table public.profile_identities enable row level security;

create index if not exists profile_identities_profile_idx
  on public.profile_identities (profile_id);

-- Arayüz "Google ile bağlı" rozetini göstersin diye. Sağlayıcı adı kişisel
-- veri değil; e-posta hiçbir yerde herkese açık durmuyor.
alter table public.profiles
  add column if not exists linked_provider text;

/*
 * Oturumu profile bağla.
 *
 * Sıra önemli:
 *   1. Bu oturumun zaten profili var mı?
 *   2. Bu KİMLİĞİN profili var mı?  ← Google ile başka cihazdan giriş burada
 *      eski hesaba düşüyor; asıl kazanç bu.
 *   3. Bu CİHAZIN profili var mı?   ← anonim kullanıcı Google'a geçtiğinde
 *      mevcut hesabı (ve satın alımları) yeni kimliğe taşınıyor.
 *   4. Yoksa yeni hesap.
 */
create or replace function public.ensure_profile(p_device_id text, p_device_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth       uuid := auth.uid();
  v_saglayici  text := coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', 'anonymous');
  v_eposta     text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  v_konu       text;
  v_profile    uuid;
  v_recent     int;
  v_handle     text;
  v_attempts   int := 0;
  v_yol        text;
begin
  if v_auth is null then
    return json_build_object('ok', false, 'message', 'Oturum yok.');
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 then
    return json_build_object('ok', false, 'message', 'Cihaz kimliği geçersiz.');
  end if;

  -- Anonim oturumda e-posta yok; kimlik bağlama yalnızca gerçek sağlayıcıda.
  if v_saglayici <> 'anonymous' and v_eposta is not null then
    v_konu := encode(sha256(convert_to(v_eposta, 'UTF8')), 'hex');
  end if;

  -- 1) Bu oturumun profili
  select id into v_profile from public.profiles where auth_user_id = v_auth;
  if v_profile is not null then
    v_yol := 'oturum';
  end if;

  -- 2) Bu kimliğin profili (başka cihaz, aynı Google hesabı)
  if v_profile is null and v_konu is not null then
    select profile_id into v_profile
    from public.profile_identities
    where provider = v_saglayici and subject = v_konu;
    if v_profile is not null then
      update public.profiles set auth_user_id = v_auth where id = v_profile;
      v_yol := 'kimlik';
    end if;
  end if;

  /*
   * 3) Bu cihazın profili (anonim hesabın Google'a yükseltilmesi)
   *
   * Kritik koşul: gelen oturumun kendi kimliği varsa ve cihazdaki hesap ZATEN
   * başka bir kimliğe bağlıysa o hesaba dokunulmuyor. Aksi hâlde paylaşılan
   * bir bilgisayarda kendi Google hesabıyla giren ikinci kişi, birincinin
   * hesabını (ve satın alımlarını) devralıyordu.
   *
   * Kimliksiz (anonim) oturumda eski davranış sürüyor: aynı tarayıcı, aynı
   * hesap — insanlar oturumu düştü diye hesabını kaybetmesin.
   */
  if v_profile is null then
    select id into v_profile from public.profiles where device_id = p_device_id;

    if v_profile is not null
       and v_konu is not null
       and exists (select 1 from public.profile_identities where profile_id = v_profile)
    then
      v_profile := null;
    elsif v_profile is not null then
      update public.profiles set auth_user_id = v_auth where id = v_profile;
      v_yol := 'cihaz';
    end if;
  end if;

  -- 4) Yeni hesap
  if v_profile is null then
    select count(*) into v_recent
    from public.profiles
    where device_hash = p_device_hash
      and created_at > now() - interval '24 hours';

    -- Google ile gelen kullanıcı gerçek bir kimlik taşıyor; cihaz başına
    -- hesap sınırı ona uygulanmıyor, yoksa kendi hesabına giremiyor.
    if v_konu is null and v_recent >= 3 then
      return json_build_object(
        'ok', false,
        'message', 'Bu cihazdan bugün çok fazla hesap açıldı. Eski hesabını kurtarma kodunla geri yükleyebilirsin.'
      );
    end if;

    loop
      v_handle := 'oyuncu' || lpad((floor(random() * 100000))::int::text, 5, '0');
      exit when not exists (select 1 from public.profiles where lower(handle) = lower(v_handle));
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        v_handle := 'oyuncu' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
        exit;
      end if;
    end loop;

    insert into public.profiles (auth_user_id, handle, display_name, device_id, device_hash)
    values (v_auth, v_handle, v_handle, p_device_id, p_device_hash)
    returning id into v_profile;
    v_yol := 'yeni';
  end if;

  /*
   * Cihaz kimliği değişmişse (çerezden geri yüklendi, tarayıcı verisi kısmen
   * silindi) profilin kaydını tazele. Kimlik başka bir profilde duruyorsa
   * dokunma: iki hesabı birbirine karıştırmaktansa eskisini korumak yeğdir.
   */
  update public.profiles
     set device_id = case
           when exists (
             select 1 from public.profiles o
             where o.device_id = p_device_id and o.id <> v_profile
           ) then device_id
           else p_device_id
         end,
         device_hash     = coalesce(p_device_hash, device_hash),
         linked_provider = case when v_konu is not null then v_saglayici else linked_provider end,
         last_seen_at    = now()
   where id = v_profile;

  -- Kimliği kaydet. Çakışmada dokunmuyoruz: bir kimlik ilk bağlandığı
  -- profilde kalır, böylece hesap hiçbir koşulda el değiştirmez.
  if v_konu is not null then
    insert into public.profile_identities (provider, subject, profile_id)
    values (v_saglayici, v_konu, v_profile)
    on conflict (provider, subject) do nothing;
  end if;

  return json_build_object('ok', true, 'profile_id', v_profile, 'yol', v_yol);
end;
$$;

revoke all on function public.ensure_profile(text, text) from public;
grant execute on function public.ensure_profile(text, text) to authenticated;
