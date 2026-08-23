-- =============================================================================
-- Oy geçmişi — zaman tüneli (timelapse) için
--
-- Geçmişi ayrıca kaydetmemize gerek yok: public.votes zaten her oyun ne zaman
-- kullanıldığını tutuyor. Haritanın herhangi bir andaki hâli, açılış tablosunun
-- (seed_tallies) üstüne o ana kadarki oyları eklemekle bulunuyor.
--
-- İstemci ham oyları tek tek çekmesin diye zaman kovalarına toplayıp
-- döndürüyoruz: 100 bin oy satır satır gelseydi telefonda hem indirmesi hem
-- işlemesi ağır olurdu.
-- =============================================================================

create index if not exists votes_created_idx on public.votes (created_at);

/*
 * p_bucket: 'minute' | 'hour' | 'day'
 *   Beyaz liste ile sınırlı — date_trunc'a dışarıdan gelen metni doğrudan
 *   vermek SQL enjeksiyonuna kapı açardı.
 * p_since: null ise tüm geçmiş.
 */
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
  v_bucket text;
begin
  v_bucket := case lower(coalesce(p_bucket, 'hour'))
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

/* Açılış tablosu istemciye de lazım: zaman tünelinin sıfırıncı karesi bu. */
create or replace view public.seed_snapshot
with (security_invoker = false) as
  select province_id, party_id, votes from public.seed_tallies;

grant select on public.seed_snapshot to anon, authenticated;
