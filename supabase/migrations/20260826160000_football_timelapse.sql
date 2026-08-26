-- =============================================================================
-- Futbol zaman tüneli: football_votes'u kovalara toplayan RPC + seed görünümü
--
-- Siyasi haritanın zaman tüneli public.votes'tan (vote_history RPC) besleniyor;
-- futbol oyları football_votes'ta ayrı durduğu için aynı işin futbol karşılığı
-- gerekiyor. Açılış tablosu da football_tallies'ten değil, seed satırlarından
-- gelir (videonun sıfırıncı karesi oyunun başlangıç hâli olmalı).
--
-- NOT: Futbol haritasının açılış tohumu kaldırıldı (20260826150000) — harita
-- sıfırdan başlıyor. Bu yüzden seed_snapshot benzeri bir futbol tohumu YOKTUR;
-- video yalnızca gerçek oyların biriktiği andan itibaren anlamlıdır. Yine de
-- RPC'nin dönüş şekli siyasiyle birebir aynıdır (bucket, province_id, club_id,
-- votes) ki istemci tek kodla iki haritayı da okuyabilsin.
-- =============================================================================

set local lock_timeout = '5s';

create or replace function public.football_vote_history(
  p_bucket text default 'hour',
  p_since  timestamptz default null
)
returns table (
  bucket      timestamptz,
  province_id text,
  club_id     text,
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
  v_dakika := case v_ad
                when '1min'   then 1
                when 'minute' then 1
                when '5min'   then 5
                when '10min'  then 10
                when '30min'  then 30
                when 'hour'   then 60
                when 'day'    then 1440
                else 60
              end;

  -- Kovaların sınırları tam dakikalara hizalansın: '10min' kovası 10:00, 10:10…
  v_saniye := v_dakika * 60;

  return query
  select date_trunc('second', to_timestamp(
           floor(extract(epoch from v.created_at) / v_saniye) * v_saniye
         )) as bucket,
         v.province_id,
         v.club_id,
         count(*)::int as votes
  from public.football_votes v
  where p_since is null or v.created_at >= p_since
  group by 1, 2, 3
  order by 1;
end;
$$;

revoke all on function public.football_vote_history(text, timestamptz) from public;
grant execute on function public.football_vote_history(text, timestamptz) to anon, authenticated;
