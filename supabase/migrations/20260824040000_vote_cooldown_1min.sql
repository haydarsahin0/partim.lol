-- =============================================================================
-- Oy bekleme süresi: 5 dakika → 1 dakika
--
-- Kural SUNUCUDA uygulanır; istemcideki sayaç yalnızca göstergedir. İsteği elle
-- atan biri istemciyi atlayabildiği için süreyi burada da kısaltmak şart.
-- src/lib/game.ts içindeki VOTE_COOLDOWN_MS ile aynı olmalı.
--
-- Sınırsız oy hakkı (profiles.unlimited_votes ve eski vote_privileges listesi)
-- olduğu gibi duruyor: o hesaplar hiç beklemiyor.
-- =============================================================================

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
                             else now() + interval '1 minute' end,
         last_seen_at = now()
   where id = v_profile;

  return json_build_object(
    'ok', true,
    'next_vote_at', case when v_unlimited then null else now() + interval '1 minute' end
  );
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- Bekleyenlerin hakkı hemen açılsın: eski beş dakikalık sayaç bir dakikaya insin.
update public.profiles
   set next_vote_at = least(next_vote_at, now() + interval '1 minute')
 where next_vote_at > now() + interval '1 minute';
