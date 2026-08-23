-- =============================================================================
-- Kullanıcıların kurduğu partiler + canlı kullanıcı sayaçları
--
-- Parti kurmak haftalık abonelik gerektirir. Abonelik yalnızca Stripe webhook'u
-- tarafından (service_role ile) etkinleştirilir; istemci hiçbir koşulda kendine
-- parti açamaz.
-- =============================================================================

-- ---------------------------- varlık göstergesi ------------------------------

alter table public.profiles
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at desc);

-- İstemci düzenli aralıklarla çağırır; "çevrimiçi" sayacı buna dayanır.
create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

-- ------------------------------ özel partiler --------------------------------

create table if not exists public.custom_parties (
  -- parties.id ile aynı değer: oylar doğrudan bu kimliğe yazılır
  id                     text primary key references public.parties (id) on delete cascade,
  owner_id               uuid not null references public.profiles (id) on delete cascade,
  stripe_subscription_id text unique,
  logo_url               text,
  -- active | expired
  status                 text not null default 'active',
  created_at             timestamptz not null default now(),
  -- Abonelik yenilendikçe ileri taşınır
  active_until           timestamptz not null
);

create index if not exists custom_parties_owner_idx on public.custom_parties (owner_id);
create index if not exists custom_parties_active_idx on public.custom_parties (status, active_until desc);

-- İstemcinin okuduğu görünüm: yalnızca süresi dolmamış partiler
create or replace view public.active_custom_parties
with (security_invoker = true) as
  select
    cp.id,
    pa.full_name as name,
    pa.name      as short_name,
    pa.color,
    cp.logo_url,
    pr.handle    as owner_handle
  from public.custom_parties cp
  join public.parties  pa on pa.id = cp.id
  join public.profiles pr on pr.id = cp.owner_id
  where cp.status = 'active' and cp.active_until > now();

-- Logo, Stripe metadata'sına sığmıyor (500 karakter sınırı). Checkout oturumu
-- açılırken buraya yazılır, webhook partiyi açarken okuyup siler.
create table if not exists public.pending_party_logos (
  session_id text primary key,
  logo_url   text not null,
  created_at timestamptz not null default now()
);

alter table public.pending_party_logos enable row level security;
-- Politika yok: yalnızca service_role erişir.

-- ------------------------------- sayaçlar ------------------------------------

create or replace view public.site_stats
with (security_invoker = true) as
  select
    (select count(*) from public.profiles where last_seen_at > now() - interval '5 minutes') as online,
    (select count(*) from public.profiles) as total;

-- --------------------------- abonelik uygulaması ------------------------------

/*
 * Ödeme onaylandıktan sonra partiyi açar veya süresini uzatır.
 * Yalnızca service_role çağırır (Stripe webhook'u).
 *
 * Renk yakınlığı denetimi istemci ve edge fonksiyonunda yapılır; burada
 * yalnızca yapısal kurallar (kısaltma uzunluğu, ad çakışması) doğrulanır.
 */
create or replace function public.apply_party_subscription(
  p_subscription_id text,
  p_user_id         uuid,
  p_name            text,
  p_short_name      text,
  p_color           text,
  p_logo_url        text,
  p_period_end      timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing text;
  v_id       text;
begin
  -- Yenileme: bu abonelik zaten bir partiye bağlıysa yalnızca süreyi uzat.
  select id into v_existing
  from public.custom_parties
  where stripe_subscription_id = p_subscription_id;

  if v_existing is not null then
    update public.custom_parties
       set active_until = greatest(active_until, p_period_end),
           status       = 'active'
     where id = v_existing;
    return json_build_object('ok', true, 'party_id', v_existing, 'renewed', true);
  end if;

  if char_length(p_short_name) < 2 or char_length(p_short_name) > 6 then
    return json_build_object('ok', false, 'message', 'Kısaltma 2–6 harf olmalı.');
  end if;

  if exists (select 1 from public.parties where lower(full_name) = lower(p_name)) then
    return json_build_object('ok', false, 'message', 'Bu adda bir parti zaten var.');
  end if;

  v_id := 'ozel-' || lower(regexp_replace(p_short_name, '[^a-zA-Z0-9]', '', 'g'))
          || '-' || substr(md5(p_subscription_id), 1, 6);

  insert into public.parties (id, name, full_name, color)
  values (v_id, upper(p_short_name), p_name, p_color);

  insert into public.custom_parties
    (id, owner_id, stripe_subscription_id, logo_url, status, active_until)
  values (v_id, p_user_id, p_subscription_id, p_logo_url, 'active', p_period_end);

  return json_build_object('ok', true, 'party_id', v_id);
end;
$$;

revoke all on function public.apply_party_subscription(text, uuid, text, text, text, text, timestamptz) from public;
revoke all on function public.apply_party_subscription(text, uuid, text, text, text, text, timestamptz) from authenticated;

-- Süresi dolanları kapat (pg_cron ile saatlik çalıştırın)
create or replace function public.expire_custom_parties()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.custom_parties
     set status = 'expired'
   where status = 'active' and active_until <= now();
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.expire_custom_parties() from public;
revoke all on function public.expire_custom_parties() from authenticated;

-- select cron.schedule('partim-expire-parties', '10 * * * *',
--   $$select public.expire_custom_parties()$$);

-- ---------------------------------- RLS --------------------------------------

alter table public.custom_parties enable row level security;

drop policy if exists "herkes okur" on public.custom_parties;
create policy "herkes okur" on public.custom_parties for select using (true);
-- Yazma politikası bilerek yok: yalnızca yukarıdaki fonksiyonlardan geçer.
