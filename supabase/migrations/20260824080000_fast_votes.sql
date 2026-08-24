-- Hızlı oy aboneliği: günlük ödemeyle oy bekleme süresi 15 saniyeye iner.
--
-- Bekleme süresi oyunun tempo ayarı: bedava oynayan dakikada bir oy kullanır,
-- abone olan 15 saniyede bir. Süre sunucuda hesaplanıyor — istemci kendi
-- bekleme süresini kısaltamaz.

-- Aboneliğin geçerli olduğu son an. Stripe her günlük yenilemede bu tarihi
-- ileri atıyor; abonelik iptal edilirse yenileme gelmez ve süre kendiliğinden
-- dolar, ayrıca bir kapatma işine gerek kalmaz.
alter table public.profiles
  add column if not exists fast_votes_until timestamptz;

-- Aynı aboneliğin iki kez açılmasını engellemek için Stripe abonelik kimliği.
alter table public.profiles
  add column if not exists fast_votes_subscription_id text;

create index if not exists profiles_fast_votes_idx
  on public.profiles (fast_votes_until)
  where fast_votes_until is not null;

-- Oy kullan. Bekleme süresi artık aboneliğe göre değişiyor.
create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_next      timestamptz;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'message', 'Önce giriş yapmalısın.');
  end if;

  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;

  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır kilidi.
  -- Bekleme süresi ayrı bir fonksiyona alınmadı: kilitli satırdan tek okumada
  -- gelmesi gerekiyor, yoksa abonelik bu iki okuma arasında değişebilir.
  select next_vote_at,
         coalesce(unlimited_votes, false),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end
    into v_next, v_unlimited, v_bekleme
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Profil bulunamadı.');
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object(
      'ok', false,
      'message', 'Oy hakkın henüz dolmadı.',
      'next_vote_at', v_next
    );
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_user_id, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni
   where id = v_user_id;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

/*
 * Hızlı oy aboneliğini uygula. Yalnızca webhook (service_role) çağırır.
 *
 * Her günlük yenilemede tekrar çağrılıyor; `greatest` sayesinde tarih hiçbir
 * zaman geriye gitmiyor, dolayısıyla Stripe'ın tekrar eden denemeleri zararsız.
 */
create or replace function public.apply_fast_votes_subscription(
  p_subscription_id text,
  p_user_id         uuid,
  p_period_end      timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_until timestamptz;
begin
  if p_user_id is null or p_period_end is null then
    return json_build_object('ok', false, 'message', 'Eksik bilgi.');
  end if;

  update public.profiles
     set fast_votes_until = greatest(coalesce(fast_votes_until, p_period_end), p_period_end),
         fast_votes_subscription_id = p_subscription_id,
         -- Abonelik başlar başlamaz beklemeden oy kullanabilsin: elindeki uzun
         -- bekleme yeni süreye kısaltılıyor.
         next_vote_at = least(coalesce(next_vote_at, now()), now() + interval '15 seconds')
   where id = p_user_id
  returning fast_votes_until into v_until;

  if v_until is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  return json_build_object('ok', true, 'fast_votes_until', v_until);
end;
$$;

revoke all on function public.apply_fast_votes_subscription(text, uuid, timestamptz) from public;
revoke all on function public.apply_fast_votes_subscription(text, uuid, timestamptz) from authenticated;

-- Abonelik iptal edilince süreyi hemen bitir. (İptal edilmezse zaten yenileme
-- gelmediği an kendiliğinden doluyor; bu, Stripe'tan iptal olayı geldiğinde
-- kullanıcının kalan saatini beklememesi için.)
create or replace function public.cancel_fast_votes_subscription(p_subscription_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set fast_votes_until = null,
         fast_votes_subscription_id = null
   where fast_votes_subscription_id = p_subscription_id;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_fast_votes_subscription(text) from public;
revoke all on function public.cancel_fast_votes_subscription(text) from authenticated;
