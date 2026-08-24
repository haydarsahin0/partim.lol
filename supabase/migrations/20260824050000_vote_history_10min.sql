-- =============================================================================
-- Zaman tüneli için 10 dakikalık çözünürlük
--
-- Saatlik kova, kısa geçmişte videoyu birkaç kareye düşürüyordu. On dakikalık
-- kova aynı süreden altı kat fazla kare çıkarıyor; video hem uzuyor hem akıcı
-- oluyor.
--
-- date_trunc on dakikayı bilmiyor: saniyeye çevirip 600'e bölüyoruz. Kova adı
-- yine beyaz listeden geçiyor — dışarıdan gelen metin date_trunc'a hiç
-- ulaşmıyor.
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
  v_bucket text := lower(coalesce(p_bucket, 'hour'));
begin
  if v_bucket = '10min' then
    return query
    select to_timestamp(floor(extract(epoch from v.created_at) / 600) * 600) as bucket,
           v.province_id,
           v.party_id,
           count(*)::int as votes
    from public.votes v
    where p_since is null or v.created_at >= p_since
    group by 1, 2, 3
    order by 1;
    return;
  end if;

  v_bucket := case v_bucket
                when 'minute' then 'minute'
                when 'day'    then 'day'
                else 'hour'
              end;

  return query
  select date_trunc(v_bucket, v.created_at) as bucket,
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
