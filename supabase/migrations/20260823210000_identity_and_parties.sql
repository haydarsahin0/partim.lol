-- =============================================================================
-- Üç düzeltme
--
-- 1) Yeni Parti ve Anahtar Parti veritabanında yoktu. Arayüzde görünüyorlardı
--    (src/data/parties.ts) ama parties tablosuna hiç eklenmemişlerdi; cast_vote
--    "Böyle bir parti yok." deyip oyu reddediyordu. Taban liste burada bütün
--    hâliyle yeniden yazılıyor ki bir daha ikisi ayrışmasın.
--
-- 2) Kimlik: profil artık yalnızca device_id'ye bağlı değil. Cihaz kimliği
--    tarayıcıda iki yerde (localStorage + çerez) saklanıyor; sunucu tarafında
--    da profilin device_id'si her ziyarette tazeleniyor, böylece iki kayıttan
--    biri kaybolduğunda hesap kaybolmuyor.
--
-- 3) Sınırsız oy hakkı artık kullanıcı adına değil profile bağlı. Kullanıcı
--    adı değişince hak kaybolmuyor. Hak, SQL Editor'dan bir kez tanımlanan
--    "sahip kodu" ile uygulama içinden talep ediliyor.
-- =============================================================================

-- ----------------------------- 1) taban partiler ------------------------------

insert into public.parties (id, name, full_name, color) values
  ('akp',      'AK Parti',       'Adalet ve Kalkınma Partisi',              '#F58220'),
  ('chp',      'CHP',            'Cumhuriyet Halk Partisi',                 '#E30A17'),
  ('dem',      'DEM Parti',      'Halkların Eşitlik ve Demokrasi Partisi',  '#7B2D8E'),
  ('mhp',      'MHP',            'Milliyetçi Hareket Partisi',              '#8E1B2E'),
  ('iyi',      'İYİ Parti',      'İYİ Parti',                               '#00A0DF'),
  ('yrp',      'Yeniden Refah',  'Yeniden Refah Partisi',                   '#0F6B4A'),
  ('zafer',    'Zafer Partisi',  'Zafer Partisi',                           '#1B3A93'),
  ('tip',      'TİP',            'Türkiye İşçi Partisi',                    '#D81E05'),
  ('sp',       'Saadet',         'Saadet Partisi',                          '#16326B'),
  ('deva',     'DEVA',           'Demokrasi ve Atılım Partisi',             '#00A8A0'),
  ('gelecek',  'Gelecek',        'Gelecek Partisi',                         '#3F51B5'),
  ('dp',       'Demokrat Parti', 'Demokrat Parti',                          '#0057A8'),
  ('hudapar',  'HÜDA PAR',       'Hür Dava Partisi',                        '#3E8E41'),
  ('bbp',      'BBP',            'Büyük Birlik Partisi',                    '#1F2E5C'),
  ('memleket', 'Memleket',       'Memleket Partisi',                        '#C2185B'),
  ('yeni',     'Yeni Parti',     'Yeni Parti',                              '#AFB42B'),
  ('anahtar',  'Anahtar Parti',  'Anahtar Parti',                           '#8D6E63')
on conflict (id) do update
  set name = excluded.name, full_name = excluded.full_name, color = excluded.color;

-- ------------------------------ 3) sınırsız hak -------------------------------

alter table public.profiles
  add column if not exists unlimited_votes boolean not null default false;

-- Eski kullanıcı adı tabanlı kayıtlar profile taşınsın
update public.profiles p
   set unlimited_votes = true
  from public.vote_privileges v
 where lower(v.handle) = lower(p.handle)
   and v.unlimited
   and not p.unlimited_votes;

/*
 * Sahip kodu. Uygulamanın paketine gömülemez — paket herkese açık, kodu okuyan
 * herkes sınırsız oy alırdı. Bu yüzden kod yalnızca burada durur ve site
 * sahibi SQL Editor'dan bir kez yazar:
 *
 *   select public.set_owner_code('KENDI-SECTIGIN-UZUN-KOD');
 *
 * Sonra o kod uygulamada Profil > Sahip kodu alanına girilir; kodu giren
 * hesabın oy bekleme süresi kalkar.
 */
create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
-- Politika yok: hiçbir istemci bu tabloyu okuyamaz. Yalnızca aşağıdaki
-- security definer fonksiyonlar erişir.

create or replace function public.set_owner_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or char_length(trim(p_code)) < 8 then
    return 'Kod en az 8 karakter olmalı.';
  end if;
  insert into public.app_secrets (key, value, updated_at)
  values ('owner_code', encode(extensions.digest(trim(p_code), 'sha256'), 'hex'), now())
  on conflict (key) do update
    set value = excluded.value, updated_at = now();
  return 'Sahip kodu kaydedildi.';
end;
$$;

-- Yalnızca SQL Editor'dan (postgres rolü) çağrılır; istemciye açılmaz.
revoke all on function public.set_owner_code(text) from public, anon, authenticated;

/* Kodu doğru giren hesaba sınırsız oy hakkı verir. */
create or replace function public.claim_unlimited(p_code text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_stored  text;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  select value into v_stored from public.app_secrets where key = 'owner_code';
  if v_stored is null then
    return json_build_object('ok', false, 'message',
      'Sahip kodu henüz tanımlanmamış. SQL Editor''dan set_owner_code çalıştırılmalı.');
  end if;

  if v_stored <> encode(extensions.digest(coalesce(trim(p_code), ''), 'sha256'), 'hex') then
    return json_build_object('ok', false, 'message', 'Kod hatalı.');
  end if;

  update public.profiles
     set unlimited_votes = true,
         next_vote_at    = null
   where id = v_profile;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.claim_unlimited(text) from public;
grant execute on function public.claim_unlimited(text) to authenticated;

-- ------------------------------ 2) kimlik ------------------------------------

/*
 * Hesabın cihaza bağlanması.
 *
 * Değişen: profilin device_id'si artık her ziyarette gelen değerle tazeleniyor.
 * İstemci kimliği hem localStorage'da hem çerezde tutuyor; biri silinip diğeri
 * kaldığında geri yüklenen değer buraya yazılır ve hesap kaybolmaz.
 *
 * device_hash hâlâ KİMLİK DEĞİL — yalnızca 24 saatte açılan hesap sayısını
 * sınırlayan sayaç anahtarı.
 */
create or replace function public.ensure_profile(p_device_id text, p_device_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth      uuid := auth.uid();
  v_profile   uuid;
  v_recent    int;
  v_handle    text;
  v_attempts  int := 0;
begin
  if v_auth is null then
    return json_build_object('ok', false, 'message', 'Oturum yok.');
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 then
    return json_build_object('ok', false, 'message', 'Cihaz kimliği geçersiz.');
  end if;

  -- 1) Bu oturumun profili
  select id into v_profile from public.profiles where auth_user_id = v_auth;

  -- 2) Yoksa bu cihaza ait profil (tarayıcı aynı, oturum yenilenmiş)
  if v_profile is null then
    select id into v_profile from public.profiles where device_id = p_device_id;
    if v_profile is not null then
      update public.profiles
         set auth_user_id = v_auth,
             last_seen_at = now()
       where id = v_profile;
      return json_build_object('ok', true, 'profile_id', v_profile, 'reattached', true);
    end if;
  else
    -- Cihaz kimliği değişmişse (çerezden geri yüklendi, tarayıcı verisi
    -- kısmen silindi) profilin kaydını tazele. Kimlik başka bir profilde
    -- duruyorsa dokunma: iki hesabı birbirine karıştırmaktansa eskisini
    -- korumak yeğdir.
    update public.profiles
       set device_id = case
             when exists (
               select 1 from public.profiles o
               where o.device_id = p_device_id and o.id <> v_profile
             ) then device_id
             else p_device_id
           end,
           device_hash  = coalesce(p_device_hash, device_hash),
           last_seen_at = now()
     where id = v_profile;
    return json_build_object('ok', true, 'profile_id', v_profile);
  end if;

  -- 3) Yeni hesap. Aynı imzadan son 24 saatte kaç tane açılmış?
  select count(*) into v_recent
  from public.profiles
  where device_hash = p_device_hash
    and created_at > now() - interval '24 hours';

  if v_recent >= 3 then
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

  return json_build_object('ok', true, 'profile_id', v_profile, 'created', true);
end;
$$;

revoke all on function public.ensure_profile(text, text) from public;
grant execute on function public.ensure_profile(text, text) to authenticated;

-- ------------------------------- oy kullanma ---------------------------------

/* Bekleme 5 dakika; sınırsız hak artık profiles.unlimited_votes üzerinden. */
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

  select next_vote_at, handle, unlimited_votes
    into v_next, v_handle, v_unlimited
  from public.profiles where id = v_profile for update;

  -- Eski kullanıcı adı tabanlı liste hâlâ geçerli (geriye dönük uyumluluk)
  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where lower(handle) = lower(v_handle);
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_profile, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = case when v_unlimited then null
                             else now() + interval '5 minutes' end,
         last_seen_at = now()
   where id = v_profile;

  return json_build_object(
    'ok', true,
    'next_vote_at', case when v_unlimited then null else now() + interval '5 minutes' end
  );
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;
