-- Aboneliği kullanıcının Google e-postasına bağla ve takip edilebilir yap.
--
-- NEDEN
--
-- Stripe müşterisinin e-postası yoktu: ödeme makbuzu kimseye gitmiyordu,
-- panelde müşteri kimliksiz görünüyordu ve bir ödeme metadata'sız kalırsa
-- sahibini bulmanın yolu yoktu. Artık Checkout'a e-posta veriliyor, Stripe
-- müşteri kimliği profile yazılıyor ve abonelik durumu arayüzde görünüyor.

-- Stripe müşteri kimliği: yenilemeleri ve iptalleri kullanıcıya bağlayan
-- kalıcı bağ. Metadata kaybolsa bile bu kalıyor.
alter table public.profiles
  add column if not exists stripe_customer_id text;

create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- Aboneliğin ne zaman başladığı: arayüzde "şu tarihten beri" demek için.
alter table public.profiles
  add column if not exists fast_votes_since timestamptz;

/*
 * Hızlı oy aboneliğini uygula. Yalnızca webhook (service_role) çağırır.
 *
 * Her günlük yenilemede tekrar çağrılıyor; `greatest` sayesinde tarih hiçbir
 * zaman geriye gitmiyor, dolayısıyla Stripe'ın tekrar eden denemeleri zararsız.
 *
 * Müşteri kimliği ve e-posta artık burada da saklanıyor: abonelik kullanıcının
 * Google hesabına bağlı kalsın, yenileme geldiğinde kime ait olduğu metadata'ya
 * bakmadan da bulunabilsin.
 */
create or replace function public.apply_fast_votes_subscription(
  p_subscription_id text,
  p_user_id         uuid,
  p_period_end      timestamptz,
  p_customer_id     text default null
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
         -- İlk uygulamada başlangıç tarihi; yenilemede dokunulmuyor.
         fast_votes_since = coalesce(fast_votes_since, now()),
         stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
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

revoke all on function public.apply_fast_votes_subscription(text, uuid, timestamptz, text) from public;
revoke all on function public.apply_fast_votes_subscription(text, uuid, timestamptz, text) from authenticated;

-- Abonelik iptal edilince süreyi hemen bitir.
create or replace function public.cancel_fast_votes_subscription(p_subscription_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set fast_votes_until = null,
         fast_votes_subscription_id = null,
         fast_votes_since = null
   where fast_votes_subscription_id = p_subscription_id;
  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cancel_fast_votes_subscription(text) from public;
revoke all on function public.cancel_fast_votes_subscription(text) from authenticated;

/*
 * Ödemesi alınmış ama sahibi bulunamamış abonelikler için son çare.
 *
 * Metadata kaybolduysa (elle açılmış abonelik, eski bir oturum) Stripe'taki
 * müşteri e-postasından kullanıcıyı bulur. E-posta düz metin olarak
 * saklanmadığı için eşleşme, kayıt sırasında kullanılan SHA-256 özeti
 * üzerinden yapılıyor.
 */
create or replace function public.find_profile_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pi.profile_id
  from public.profile_identities pi
  where pi.subject = encode(sha256(convert_to(lower(trim(p_email)), 'UTF8')), 'hex')
  limit 1;
$$;

revoke all on function public.find_profile_by_email(text) from public;
revoke all on function public.find_profile_by_email(text) from authenticated;
revoke all on function public.find_profile_by_email(text) from anon;
