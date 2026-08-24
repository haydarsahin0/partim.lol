-- Düzeltme: cast_vote ve hold_rally profili bulamıyordu.
--
-- NE OLDU
--
-- Bu oyunda oturum kimliği ile profil kimliği ayrı: hesaplar cihaza bağlı
-- açıldığı için profiles.id, auth.uid() ile aynı değil (bkz. cihaz hesapları
-- göçü, 20260823170000). Doğru çözümleme public.current_profile_id() ile
-- yapılıyor.
--
-- Hızlı oy aboneliği eklenirken cast_vote yeniden yazıldı ama taban olarak
-- ilk sürüm alındı; o sürüm auth.uid() değerini doğrudan profiles.id ile
-- karşılaştırıyordu. Hiçbir satır eşleşmediği için oy kullanmak "Profil
-- bulunamadı." hatası veriyordu. Aynı hata miting fonksiyonunda da vardı:
-- leader_seats.user_id bir profil kimliği, dolayısıyla koltuğun sahibi hiçbir
-- zaman bulunamıyordu.
--
-- Bu arada kaybolan iki şey de geri getiriliyor: kullanıcı adı tabanlı eski
-- sınırsız oy listesi (vote_privileges) ve last_seen_at güncellemesi.

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
  -- kilidi. Bekleme süresi ayrı bir fonksiyona alınmadı: kilitli satırdan tek
  -- okumada gelmesi gerekiyor, yoksa abonelik bu iki okuma arasında değişebilir.
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
         last_seen_at = now()
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- Miting: aynı düzeltme. leader_seats.user_id bir profil kimliği.
create or replace function public.hold_rally(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_holder  uuid;
  v_last    timestamptz;
  v_votes   int := 100;
  v_bekleme interval := interval '24 hours';
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır kilidi.
  select user_id, last_rally_at into v_holder, v_last
  from public.leader_seats
  where province_id = p_province_id and party_id = p_party_id
  for update;

  if not found or v_holder is null then
    return json_build_object('ok', false, 'message', 'Bu koltuğun başkanı yok.');
  end if;

  if v_holder <> v_profile then
    return json_build_object('ok', false, 'message', 'Bu ilde o partinin başkanı sen değilsin.');
  end if;

  if v_last is not null and v_last + v_bekleme > now() then
    return json_build_object(
      'ok', false,
      'message', 'Bugünkü mitingini yaptın.',
      'next_rally_at', v_last + v_bekleme
    );
  end if;

  -- Miting oyları gerçek satır olarak yazılıyor; hepsi aynı ana düşüyor.
  insert into public.votes (user_id, province_id, party_id, source)
  select v_profile, p_province_id, p_party_id, 'rally'
  from generate_series(1, v_votes);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, v_votes)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + v_votes;

  update public.leader_seats
     set last_rally_at = now()
   where province_id = p_province_id and party_id = p_party_id;

  update public.profiles set last_seen_at = now() where id = v_profile;

  return json_build_object(
    'ok', true,
    'votes', v_votes,
    'next_rally_at', now() + v_bekleme
  );
end;
$$;

revoke all on function public.hold_rally(text, text) from public;
grant execute on function public.hold_rally(text, text) to authenticated;

-- Hatalı sürümde bekleyen oy hakkı kalmışsa hemen açılsın.
update public.profiles
   set next_vote_at = least(next_vote_at, now())
 where next_vote_at > now() + interval '1 minute'
   and (fast_votes_until is null or fast_votes_until <= now());
