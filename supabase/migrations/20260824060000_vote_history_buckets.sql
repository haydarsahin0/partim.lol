-- =============================================================================
-- Zaman tüneli dilimleri: 5 / 10 / 15 / 30 dakika ve saat / gün
--
-- Önce yalnızca '10min' özel olarak ele alınıyordu. Dilim seçimi zaman
-- tünelinin ana denetimi hâline geldiği için sayıyı metinden okuyup
-- genelleştiriyoruz.
--
-- Dakika değeri BEYAZ LİSTEDEN geçiyor: dışarıdan gelen metin hiçbir zaman
-- doğrudan sorguya girmiyor, yalnızca izinli sayılardan biriyle eşleşiyor.
-- =============================================================================

create or replace function public.vote_history(
  p_bucket text default 'hour',
  p_since  timestamptz default null
)
returns table (
  bucket      timestamptz,
  province_id text,
  party_id    text,
  votes       int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ad      text := lower(trim(coalesce(p_bucket, 'hour')));
  v_dakika  int;
  v_saniye  int;
begin
  -- "30min" → 30. İzinli olmayan her şey saatliğe düşer.
  v_dakika := case v_ad
                when '1min'  then 1
                when 'minute' then 1
                when '5min'  then 5
                when '10min' then 10
                when '15min' then 15
                when '30min' then 30
                else null
              end;

  if v_dakika is not null then
    v_saniye := v_dakika * 60;
    return query
    select to_timestamp(floor(extract(epoch from v.created_at) / v_saniye) * v_saniye) as bucket,
           v.province_id,
           v.party_id,
           count(*)::int as votes
    from public.votes v
    where p_since is null or v.created_at >= p_since
    group by 1, 2, 3
    order by 1;
    return;
  end if;

  return query
  select date_trunc(case when v_ad = 'day' then 'day' else 'hour' end, v.created_at) as bucket,
         v.province_id,
         v.party_id,
         count(*)::int as votes
  from public.votes v
  where p_since is null or v.created_at >= p_since
  group by 1, 2, 3
  order by 1;
end;
$$;

revoke all on function public.vote_history(text, timestamptz) from public;
grant execute on function public.vote_history(text, timestamptz) to anon, authenticated;
