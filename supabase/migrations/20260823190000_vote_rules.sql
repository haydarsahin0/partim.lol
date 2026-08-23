-- =============================================================================
-- Oy kuralları: soğuma süresi 5 dakikaya indi, bir hesaba sınırsız hak tanındı
--
-- Ayrıcalık SUNUCUDA denetleniyor. Yalnızca istemcide kalsaydı, isteği elle
-- atan herkes sınırsız oy kullanabilirdi — oyunun tüm dengesi buna bağlı.
-- =============================================================================

create table if not exists public.vote_privileges (
  handle     text primary key,
  unlimited  boolean not null default true,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.vote_privileges enable row level security;

drop policy if exists "herkes okur" on public.vote_privileges;
create policy "herkes okur" on public.vote_privileges for select using (true);
-- Yazma politikası yok: satırlar yalnızca SQL Editor'dan elle eklenir.

insert into public.vote_privileges (handle, note)
values ('oyuncu47172', 'Sınırsız oy hakkı')
on conflict (handle) do update set unlimited = true;

/* src/lib/game.ts ile aynı: 5 dakika */
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

  select next_vote_at, handle into v_next, v_handle
  from public.profiles where id = v_profile for update;

  select coalesce(bool_or(unlimited), false) into v_unlimited
  from public.vote_privileges where lower(handle) = lower(v_handle);

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
