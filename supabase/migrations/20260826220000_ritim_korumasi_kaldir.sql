-- =============================================================================
-- Oy ritim koruması kaldırıldı
--
-- Bot savunması göçü (20260826120000) "oy ritmin çok düzenli" diye oy
-- reddediyordu; eşikler normal kullanıcıları da yakalıyordu (dakikada 1 oy
-- soğuması olan birinin aralıkları doğal olarak düzenli). Kullanıcı deneyimi
-- bozulduğu için ritim reddi her iki haritadan da kaldırıldı:
--
--   - cast_vote (siyasi): ritim bloğu çıkarıldı, suspected_bot_at damgası
--     artık atılmıyor. Diğer korumalar AYNI KALIYOR: anonim tavan, soğuma,
--     vote_rate_ok tavanı, cihaz bütçesi, is_bot reddi.
--   - football_cast_vote (futbol): aynı şekilde ritim bloğu çıkarıldı.
--
-- suspected_vote_bots görünümü ve bot-temizle betiği duruyor: ritim artık
-- oyu ENGELLEMEZ, yalnızca elle temizlikte göz kararı listesi olarak kalır.
-- =============================================================================

set local lock_timeout = '5s';

create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_next      timestamptz;
  v_handle    text;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
  v_kendi_partisi boolean := false;
  v_kendi_parti_saatlik_oy int := 0;
  v_anon      boolean := false;          -- kimliksiz (X/Google yok) ve ödeme yok
  v_toplam    int := 0;                  -- hesabın şimdiye kadarki oyu (vote_count)
  v_gunluk    int := 0;                  -- son 24 saatteki oy sayısı
  v_gunluk_tavan int := 60;
  v_omur_tavan   int := 150;
  v_bot       boolean := false;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  -- Temizlikte is_bot işaretlenen hesap tekrar oy kullanamaz (aynı cihazdan
  -- geri giriş yapsa bile).
  select coalesce(is_bot, false) into v_bot
  from public.profiles where id = v_profile;
  if v_bot then
    return json_build_object('ok', false, 'message', 'Bu hesap bot olarak işaretlendi.');
  end if;
  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  select exists (
    select 1
    from public.custom_parties cp
    where cp.id = p_party_id
      and cp.owner_id = v_profile
  )
  into v_kendi_partisi;

  if v_kendi_partisi then
    select count(*)
      into v_kendi_parti_saatlik_oy
    from public.votes v
    where v.user_id = v_profile
      and v.party_id = p_party_id
      and v.created_at > now() - interval '1 hour'
      and v.source is distinct from 'rally';

    if v_kendi_parti_saatlik_oy >= 10 then
      return json_build_object(
        'ok', false,
        'message', 'Sen zaten parti kurucususun; kendi partine 1 saatte en fazla 10 oy verebilirsin.'
      );
    end if;
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır
  -- kilidi. Bekleme süresi kilitli satırdan tek okumada geliyor.
  select next_vote_at,
         handle,
         coalesce(unlimited_votes, false),
         coalesce(vote_count, 0),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end,
         -- Anonim: kimlik bağı yok VE aktif hızlı oy ödemesi yok.
         (linked_provider is null
          and (fast_votes_until is null or fast_votes_until <= now()))
    into v_next, v_handle, v_unlimited, v_toplam, v_bekleme, v_anon
  from public.profiles
  where id = v_profile
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where profile_id = v_profile;
    if v_unlimited then v_bekleme := interval '0'; end if;
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  /*
   * ANONİM TAVAN — kimliksiz hesaplar çiftlik para birimi.
   *
   * Günlük tavan çiftliğin günlük verimini, ömür tavanı hesap başına verimi
   * keser. Kimliğini bağlayan (X/Google) ya da hızlı oy ödeyen hesap
   * dokunulmaz: bağlamak zaten oyunun istediği davranış.
   */
  if not v_unlimited and v_anon then
    select count(*)
      into v_gunluk
    from public.votes
    where user_id = v_profile
      and created_at > now() - interval '1 day'
      and source is distinct from 'rally';

    if v_gunluk >= v_gunluk_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Anonim hesabın bugünkü oy hakkı doldu. Yarın tekrar gel ya da profilden X/Google ile bağlan.'
      );
    end if;

    if v_toplam >= v_omur_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Bu hesabın oy hakkı doldu. Profilinden X/Google ile bağlanarak devam edebilirsin.'
      );
    end if;
  end if;

  if not public.vote_rate_ok(v_profile) then
    return json_build_object(
      'ok', false,
      'message', 'Çok hızlı oy kullanıyorsun. Biraz bekle.'
    );
  end if;

  -- Cihaz bütçesi: sınırsız hakkı olan muaf, çünkü tavan onu zaten tutuyor.
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
         trusted_at   = case
                          when trusted_at is null
                               and public.profile_trusted(vote_count + 1, leader_count)
                          then now() else trusted_at
                        end
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;


create or replace function public.football_cast_vote(p_province_id text, p_club_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_next      timestamptz;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
  v_anon      boolean := false;
  v_toplam    int := 0;
  v_gunluk    int := 0;
  v_gunluk_tavan int := 60;
  v_omur_tavan   int := 150;
  v_bot       boolean := false;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  select coalesce(is_bot, false) into v_bot
  from public.profiles where id = v_profile;
  if v_bot then
    return json_build_object('ok', false, 'message', 'Bu hesap bot olarak işaretlendi.');
  end if;

  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.football_clubs where id = p_club_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir kulüp yok.');
  end if;

  select next_vote_at,
         coalesce(unlimited_votes, false),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end,
         (linked_provider is null
          and (fast_votes_until is null or fast_votes_until <= now())),
         coalesce(vote_count, 0)
    into v_next, v_unlimited, v_bekleme, v_anon, v_toplam
  from public.profiles
  where id = v_profile
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where profile_id = v_profile;
    if v_unlimited then v_bekleme := interval '0'; end if;
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  -- Anonim tavan: günde 60, ömür 150 (siyasi haritayla aynı para birimi).
  if not v_unlimited and v_anon then
    select count(*) into v_gunluk
    from public.football_votes
    where user_id = v_profile
      and created_at > now() - interval '1 day'
      and source is distinct from 'daily';
    if v_gunluk >= v_gunluk_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Anonim hesabın bugünkü oy hakkı doldu. Yarın tekrar gel ya da profilden X/Google ile bağlan.'
      );
    end if;
    if v_toplam >= v_omur_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Bu hesabın oy hakkı doldu. Profilinden X/Google ile bağlanarak devam edebilirsin.'
      );
    end if;
  end if;

  if not public.vote_rate_ok(v_profile) then
    return json_build_object('ok', false, 'message', 'Çok hızlı oy kullanıyorsun. Biraz bekle.');
  end if;
  if not v_unlimited and not public.device_vote_budget_ok(v_profile) then
    return json_build_object('ok', false, 'message', 'Bu cihazdan çok hızlı oy kullanılıyor. Biraz bekle.');
  end if;

  insert into public.football_votes (user_id, province_id, club_id)
  values (v_profile, p_province_id, p_club_id);

  insert into public.football_tallies (province_id, club_id, votes)
  values (p_province_id, p_club_id, 1)
  on conflict (province_id, club_id)
    do update set votes = public.football_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni,
         last_seen_at = now()
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;


