-- Çok hesaplı kötüye kullanıma karşı savunma.
--
-- DURUM TESPİTİ
--
-- Bir kişi onlarca Gmail hesabı açıp hepsiyle girebiliyor (sıralamada
-- "imamoglu1, imamoglu2, imamoglu3..." gibi kümeler bunun işareti). Bunu
-- TÜMÜYLE engellemek mümkün değil: e-posta açmak bedava ve sınırsız, tarayıcı
-- verisi silinebilir, farklı cihaz kullanılabilir. Kimlik doğrulama (telefon,
-- kimlik) koymak engellerdi ama oyunun tek çekiciliği "gir ve oyna" olduğu
-- için kullanıcının çoğunu da kaçırırdı.
--
-- O yüzden hedef ENGELLEMEK değil, ÜÇ AYAKLI CAYDIRMA:
--
--   1. KARŞILIĞINI YOK ET — yeni hesap sıralamada görünmüyor. Kümeyi
--      görünür kılan şey sıralamaydı; emeğin karşılığı alınmayınca
--      onlarca hesap açmanın anlamı kalmıyor.
--   2. HIZINI KES — aynı tarayıcıdaki bütün hesaplar ortak bir oy
--      bütçesi paylaşıyor. On hesap açmak on kat oy vermek demek değil.
--   3. GÖRÜNÜR KIL — kümeleri listeleyen bir görünüm; kalanı elle
--      temizlenebilsin.
--
-- Hiçbiri normal kullanıcıya dokunmuyor: tek hesabıyla giren, tek tarayıcıda
-- oynayan kimse bu sınırlara çarpmıyor.

-- ---------------------------------------------------------------------------
-- 1. Sıralama güveni
-- ---------------------------------------------------------------------------

/*
 * Bir hesap sıralamada görünmeye hak kazandı mı?
 *
 * Eşik bilerek düşük: 10 oy ya da bir il başkanlığı. Gerçekten oynayan biri
 * ilk birkaç dakikada geçiyor, farkına bile varmıyor. Toplu açılmış hesaplar
 * ise geçmiyor — çünkü hepsini tek tek oynatmak, işi bedava olmaktan
 * çıkarıyor.
 */
alter table public.profiles
  add column if not exists trusted_at timestamptz;

/*
 * KAYIT anındaki cihaz imzası. Bir daha değişmiyor.
 *
 * device_hash her girişte üzerine yazılıyor (kullanıcının o anki cihazı).
 * Hesap açma sayacı ve küme görünümü onu kullanınca, hesaplarını farklı
 * cihazlarda bir kez açtıran biri hem sayacı sıfırlıyor hem de izini
 * siliyordu. Kayıt imzası sabit kaldığı için ikisi de artık güvenilir.
 */
alter table public.profiles
  add column if not exists signup_device_hash text;

create index if not exists profiles_signup_hash_idx
  on public.profiles (signup_device_hash, created_at desc)
  where signup_device_hash is not null;

-- Mevcut hesaplar: elimizdeki tek imza bu, kayıt imzası olarak kabul edelim.
update public.profiles
   set signup_device_hash = device_hash
 where signup_device_hash is null and device_hash is not null;

create or replace function public.profile_trusted(p_vote_count int, p_leader_count int)
returns boolean
language sql
immutable
as $$
  select coalesce(p_vote_count, 0) >= 10 or coalesce(p_leader_count, 0) > 0;
$$;

/*
 * Sıralama listesi.
 *
 * Görünüm olarak duruyor ki kural tek yerde kalsın; istemci tabloyu kendi
 * filtresiyle okuduğunda kuralı atlayabiliyordu.
 */
create or replace view public.leaderboard
with (security_invoker = true) as
  select id, handle, display_name, avatar_url, x_handle, is_bot,
         xp, vote_count, leader_count
  from public.profiles
  where coalesce(is_bot, false) = false
    and public.profile_trusted(vote_count, leader_count);

grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cihaz başına ortak oy bütçesi
-- ---------------------------------------------------------------------------

/*
 * Oy bekleme süresi hesap başına işliyordu: on hesap açan kişi dakikada on oy
 * kullanabiliyordu. Artık aynı TARAYICIYA bağlı bütün hesaplar ortak bir
 * bütçe paylaşıyor.
 *
 * Neden device_id (kesin) ve device_hash (kaba) değil: kaba imza aynı model
 * telefonu aynı ülkede kullanan iki farklı kişide de aynı çıkabiliyor; onun
 * üzerinden oy kısmak masum kullanıcıyı cezalandırırdı. device_id ise
 * tarayıcıya özel ve rastgele — çakışmaz.
 *
 * Bütçe cömert (dakikada 3): aynı bilgisayarı paylaşan iki kardeş rahatça
 * oynar, on hesaplı çiftlik ise hız kazanamaz.
 */
create or replace function public.device_vote_budget_ok(p_profile uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_device text;
  v_sayi   int;
begin
  select device_id into v_device from public.profiles where id = p_profile;
  if v_device is null then return true; end if;

  select count(*) into v_sayi
  from public.votes v
  join public.profiles p on p.id = v.user_id
  where p.device_id = v_device
    and v.created_at > now() - interval '1 minute'
    and v.source is distinct from 'rally';

  return v_sayi < 3;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Oy kullanma: cihaz bütçesi de denetlensin
-- ---------------------------------------------------------------------------

create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_handle    text;
  v_next      timestamptz;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;
  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır
  -- kilidi. Bekleme süresi kilitli satırdan tek okumada geliyor.
  select next_vote_at,
         handle,
         coalesce(unlimited_votes, false),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end
    into v_next, v_handle, v_unlimited, v_bekleme
  from public.profiles
  where id = v_profile
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  -- Eski kullanıcı adı tabanlı liste hâlâ geçerli (geriye dönük uyumluluk)
  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where lower(handle) = lower(v_handle);
    if v_unlimited then v_bekleme := interval '0'; end if;
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  /*
   * Cihaz bütçesi. Sınırsız hakkı olan (oyun sahibi) muaf; onun dışında aynı
   * tarayıcıdaki bütün hesaplar aynı bütçeden yiyor.
   */
  if not v_unlimited and not public.device_vote_budget_ok(v_profile) then
    return json_build_object(
      'ok', false,
      'message', 'Bu cihazdan çok hızlı oy kullanılıyor. Biraz bekle.'
    );
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_profile, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni,
         last_seen_at = now(),
         -- Güven eşiğini geçtiği anı bir kez damgala.
         trusted_at   = case
                          when trusted_at is null
                               and public.profile_trusted(vote_count + 1, leader_count)
                          then now() else trusted_at
                        end
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hesap açma: kimlikli girişte de cihaz sınırı
-- ---------------------------------------------------------------------------

/*
 * Cihaz başına hesap açma sınırı Google ile girenlerde uygulanmıyordu.
 * Gerekçe "kullanıcı kendi hesabına giremesin istemeyiz" idi ama bu yersiz:
 * sınır yalnızca YENİ hesap açılırken çalışıyor, mevcut hesabına dönen
 * kullanıcı ondan önceki kimlik eşleşmesinde yakalanıyor.
 *
 * Ayrıca device_id çakışması artık hata vermiyor: aynı tarayıcıda ikinci bir
 * hesap açılırsa yeni satır device_id'siz kuruluyor (eskisi sahibinde kalıyor).
 * Önceden benzersiz dizin ihlali fonksiyonu düşürüyordu.
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
  v_cihaz_bos  boolean;
begin
  if v_auth is null then
    return json_build_object('ok', false, 'message', 'Oturum yok.');
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 then
    return json_build_object('ok', false, 'message', 'Cihaz kimliği geçersiz.');
  end if;

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

  -- 3) Bu cihazın profili. Cihazdaki hesap başka bir kimliğe bağlıysa
  --    dokunulmuyor: paylaşılan bilgisayarda ikinci kişi birincinin hesabını
  --    devralmasın.
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
    -- Sayaç KAYIT imzasına bakıyor: giriş imzası her seferinde güncellendiği
    -- için onunla sayınca, hesapları farklı cihazlarda açan biri sayacı
    -- sıfırlayabiliyordu.
    select count(*) into v_recent
    from public.profiles
    where signup_device_hash = p_device_hash
      and created_at > now() - interval '24 hours';

    -- Sınır artık Google ile girenler için de geçerli: buraya yalnızca
    -- GERÇEKTEN yeni bir hesap açılırken geliniyor.
    if v_recent >= 3 then
      return json_build_object(
        'ok', false,
        'message', 'Bu cihazdan bugün çok fazla hesap açıldı. Yarın tekrar dene ya da mevcut hesabınla giriş yap.'
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

    -- device_id benzersiz: başkasındaysa bu hesaba yazılmıyor.
    select not exists (select 1 from public.profiles where device_id = p_device_id)
      into v_cihaz_bos;

    insert into public.profiles
      (auth_user_id, handle, display_name, device_id, device_hash, signup_device_hash)
    values (v_auth, v_handle, v_handle,
            case when v_cihaz_bos then p_device_id else null end,
            p_device_hash, p_device_hash)
    returning id into v_profile;
    v_yol := 'yeni';
  end if;

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

-- ---------------------------------------------------------------------------
-- 5. Görünürlük: kümeleri listele
-- ---------------------------------------------------------------------------

/*
 * Aynı tarayıcıya ya da aynı kaba imzaya bağlı hesap kümeleri.
 *
 * Otomatik ceza vermiyor — kaba imza masum çakışabilir. Bu, elle bakıp karar
 * vermek için. RLS'i politikasız: yalnızca service_role (Supabase paneli /
 * SQL Editor) okuyabiliyor, istemciye kapalı.
 */
create or replace view public.account_clusters as
  select signup_device_hash as device_hash,
         count(*)                                          as hesap_sayisi,
         count(*) filter (where trusted_at is not null)     as guvenilen,
         min(created_at)                                    as ilk_hesap,
         max(last_seen_at)                                  as son_gorulme,
         array_agg(handle order by created_at)              as kullanici_adlari,
         sum(vote_count)                                    as toplam_oy
  from public.profiles
  where signup_device_hash is not null
    and coalesce(is_bot, false) = false
  group by signup_device_hash
  having count(*) > 2
  order by count(*) desc;

revoke all on public.account_clusters from anon, authenticated;

-- Mevcut hesaplar: eşiği zaten geçmiş olanları damgala ki sıralamadan düşmesinler.
update public.profiles
   set trusted_at = coalesce(trusted_at, created_at)
 where trusted_at is null
   and public.profile_trusted(vote_count, leader_count);
