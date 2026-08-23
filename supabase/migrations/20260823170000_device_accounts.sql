-- =============================================================================
-- Cihaz tabanlı hesaplar
--
-- Giriş/kayıt ekranı kaldırıldı. Kullanıcı siteyi açtığında Supabase'in anonim
-- oturumu açılır ve bu cihaza bağlı bir profil oluşur; geri geldiğinde aynı
-- hesaba düşer.
--
-- Kilit tasarım kararı: profiles.id ARTIK auth.users'a bağlı DEĞİL. Kimlik
-- (auth_user_id) ile oyun verisi (profiles.id) ayrıldı. Böylece kullanıcı
-- tarayıcı verisini silip yeni bir anonim oturum açtığında, kurtarma koduyla
-- eski profilini yeni oturuma bağlayabiliyoruz; oylar ve koltuklar taşınmıyor,
-- oldukları yerde kalıyor.
-- =============================================================================

-- digest() için gerekli
create extension if not exists pgcrypto with schema extensions;

-- ------------------------- kimliği oyun verisinden ayır -----------------------

alter table public.profiles
  add column if not exists auth_user_id  uuid,
  add column if not exists device_id     text,
  add column if not exists device_hash   text,
  add column if not exists x_handle      text,
  -- Kurtarma kodu düz metin saklanmaz.
  add column if not exists recovery_hash text;

-- Mevcut satırlar (varsa) kendi kimliklerini taşısın
update public.profiles set auth_user_id = id where auth_user_id is null;

-- profiles.id artık auth.users'a bağlı olmamalı
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();

create unique index if not exists profiles_auth_user_idx on public.profiles (auth_user_id);
create unique index if not exists profiles_device_idx    on public.profiles (device_id);
create unique index if not exists profiles_handle_idx    on public.profiles (lower(handle));
create index        if not exists profiles_device_hash_idx on public.profiles (device_hash, created_at desc);

-- OAuth tetikleyicisi artık geçersiz: profil ensure_profile ile açılıyor.
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- Oturumdaki kullanıcının profil kimliği. Diğer fonksiyonlar bunu kullanır.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid();
$$;

grant execute on function public.current_profile_id() to authenticated, anon;

-- ------------------------------ hesap açma -----------------------------------

/*
 * Cihaz başına yeni hesap sınırı.
 *
 * device_hash kaba bir imza: aynı model cihazı aynı ülkede kullanan iki farklı
 * kişi aynı değeri üretebilir. Bu yüzden imza KİMLİK olarak kullanılmaz ve
 * kimse kilitlenmez — yalnızca kısa sürede arka arkaya açılan hesap sayısı
 * sınırlanır. Sert bir "tek hesap" kuralı koysaydık, telefonunu değiştiren
 * veya verisini silen dürüst kullanıcı oyundan tamamen dışlanırdı.
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

  -- Zaten profili var
  select id into v_profile from public.profiles where auth_user_id = v_auth;
  if v_profile is not null then
    update public.profiles
       set device_id    = coalesce(device_id, p_device_id),
           device_hash  = coalesce(p_device_hash, device_hash),
           last_seen_at = now()
     where id = v_profile;
    return json_build_object('ok', true, 'profile_id', v_profile);
  end if;

  -- Bu cihaza ait profil varsa yeni oturuma bağla (aynı tarayıcı, yenilenmiş JWT)
  select id into v_profile from public.profiles where device_id = p_device_id;
  if v_profile is not null then
    update public.profiles
       set auth_user_id = v_auth,
           last_seen_at = now()
     where id = v_profile;
    return json_build_object('ok', true, 'profile_id', v_profile, 'reattached', true);
  end if;

  -- Aynı imzadan son 24 saatte kaç hesap açılmış?
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

  -- Çakışmayan bir kullanıcı adı üret
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

-- ---------------------------- profil düzenleme --------------------------------

/*
 * null  = bu alana dokunma
 * ''    = alanı temizle (yalnızca x_handle ve avatar_url için anlamlı)
 */
create or replace function public.update_profile(
  p_handle       text,
  p_display_name text,
  p_x_handle     text,
  p_avatar_url   text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  if p_handle is not null then
    if p_handle !~ '^[A-Za-z0-9_]{3,20}$' then
      return json_build_object('ok', false, 'message',
        'Kullanıcı adı 3–20 karakter olmalı; harf, rakam ve alt çizgi.');
    end if;
    if exists (
      select 1 from public.profiles
      where lower(handle) = lower(p_handle) and id <> v_profile
    ) then
      return json_build_object('ok', false, 'message', 'Bu kullanıcı adı alınmış.');
    end if;
    update public.profiles set handle = p_handle where id = v_profile;
  end if;

  if p_display_name is not null then
    if char_length(p_display_name) < 1 or char_length(p_display_name) > 40 then
      return json_build_object('ok', false, 'message', 'Görünen ad 1–40 karakter olmalı.');
    end if;
    update public.profiles set display_name = p_display_name where id = v_profile;
  end if;

  if p_x_handle is not null then
    if p_x_handle = '' then
      update public.profiles set x_handle = null where id = v_profile;
    elsif p_x_handle !~ '^[A-Za-z0-9_]{1,15}$' then
      return json_build_object('ok', false, 'message', 'X kullanıcı adı en fazla 15 karakter olabilir.');
    else
      update public.profiles set x_handle = p_x_handle where id = v_profile;
    end if;
  end if;

  if p_avatar_url is not null then
    if p_avatar_url = '' then
      update public.profiles set avatar_url = null where id = v_profile;
    elsif char_length(p_avatar_url) > 300000 then
      return json_build_object('ok', false, 'message', 'Görsel çok büyük.');
    else
      update public.profiles set avatar_url = p_avatar_url where id = v_profile;
    end if;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.update_profile(text, text, text, text) from public;
grant execute on function public.update_profile(text, text, text, text) to authenticated;

-- ------------------------------- kurtarma -------------------------------------

/*
 * Kurtarma kodu üretir ve düz metnini BİR KEZ döner; veritabanında yalnızca
 * özeti saklanır. Her çağrı yeni kod üretir ve öncekini geçersiz kılar —
 * "kaydetmeyi unuttum" durumunda kullanıcıyı kilitlememek için bilinçli tercih.
 */
create or replace function public.get_recovery_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_code    text;
begin
  if v_profile is null then return null; end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  -- Karışabilen harfleri alfabeden çıkar (O/0, I/1)
  v_code := translate(v_code, 'OI01', 'PJ23');

  update public.profiles
     set recovery_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
   where id = v_profile;

  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
end;
$$;

revoke all on function public.get_recovery_code() from public;
grant execute on function public.get_recovery_code() to authenticated;

/* Kurtarma kodunu bu oturuma bağlar: eski profil yeni anonim kullanıcıya geçer. */
create or replace function public.restore_account(p_code text, p_device_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth    uuid := auth.uid();
  v_target  uuid;
  v_current uuid;
begin
  if v_auth is null then
    return json_build_object('ok', false, 'message', 'Oturum yok.');
  end if;

  select id into v_target
  from public.profiles
  where recovery_hash = encode(extensions.digest(upper(p_code), 'sha256'), 'hex');

  if v_target is null then
    return json_build_object('ok', false, 'message', 'Kod geçersiz.');
  end if;

  -- Bu oturumun mevcut profili varsa serbest bırak. Hiç oynanmamışsa tamamen
  -- silinir; ilerlemesi varsa yalnızca oturumdan çözülür (kendi kurtarma
  -- koduyla geri alınabilsin diye korunur).
  select id into v_current from public.profiles where auth_user_id = v_auth;
  if v_current is not null and v_current <> v_target then
    update public.profiles set auth_user_id = null, device_id = null where id = v_current;
    delete from public.profiles
     where id = v_current and vote_count = 0 and leader_count = 0 and recovery_hash is null;
  end if;

  update public.profiles
     set auth_user_id  = v_auth,
         device_id     = p_device_id,
         last_seen_at  = now(),
         -- Kod kullanıldı: yenisi istenene kadar geçersiz.
         recovery_hash = null
   where id = v_target;

  return json_build_object('ok', true, 'profile_id', v_target);
end;
$$;

revoke all on function public.restore_account(text, text) from public;
grant execute on function public.restore_account(text, text) to authenticated;

-- --------------- oyun fonksiyonlarını yeni kimlik modeline taşı ---------------

create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now()
   where auth_user_id = auth.uid();
$$;

create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_next    timestamptz;
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

  select next_vote_at into v_next from public.profiles where id = v_profile for update;

  if v_next is not null and v_next > now() then
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
         next_vote_at = now() + interval '1 hour',
         last_seen_at = now()
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', now() + interval '1 hour');
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- seat_purchases.user_id ve custom_parties.owner_id artık profiles.id tutuyor;
-- webhook'lar auth kimliği yerine profil kimliğini yollamalı.
create or replace function public.profile_id_for_auth(p_auth uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = p_auth;
$$;

-- ---------------------------------- RLS ---------------------------------------

-- Anonim oturumlar da okuyabilmeli
grant usage on schema public to anon, authenticated;

drop policy if exists "kendi odemeleri" on public.seat_purchases;
create policy "kendi odemeleri" on public.seat_purchases
  for select using (user_id = public.current_profile_id());
