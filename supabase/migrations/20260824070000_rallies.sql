-- Miting: il başkanının günde bir kez partisine o ilde toplu oy eklemesi.
--
-- NEDEN VAR
--
-- İl başkanlığı parayla alınıyordu ama haritaya hiç dokunmuyordu; ödeme yapan
-- kişi karşılığında oyunun içinde bir güç almıyordu. Miting, koltuğu haritanın
-- koluna çeviriyor: o ilde o partinin mitingini yalnızca başkanı düzenleyebilir.

-- Mitingin son düzenlendiği an. Koltuk el değiştirince sıfırlanmıyor: hak
-- koltuğa bağlı, kişiye değil. Aksi hâlde koltuğu alıp satarak günde birden
-- çok miting yapılabilirdi.
alter table public.leader_seats
  add column if not exists last_rally_at timestamptz;

-- Oyun kaynağı. Toplam tablo (province_tallies) her zaman public.votes'tan
-- yeniden kurulabilmeli; miting oyları da bu yüzden gerçek satır olarak
-- yazılıyor, sayaca elle eklenmiyor.
alter table public.votes
  add column if not exists source text not null default 'vote';

create index if not exists votes_source_idx on public.votes (source, created_at desc);

-- Canlı akış şeridi mitingi tek satır göstersin.
--
-- Bir miting 100 satır yazıyor ve hepsi aynı `now()` değerini taşıyor (now()
-- işlem boyunca sabittir). Şerit ham hâliyle 100 özdeş satırla dolup akışı
-- yutuyordu; distinct on ile her miting tek olaya iniyor.
create or replace view public.recent_votes
with (security_invoker = true) as
  -- Sütun sırası korunuyor: create or replace view yeni sütunu yalnızca sona
  -- ekleyebiliyor, araya sıkıştırılanı reddediyor.
  select distinct on (v.created_at, v.user_id, v.province_id, v.party_id, v.source)
         v.province_id, v.party_id, v.created_at, p.handle, v.source
  from public.votes v
  join public.profiles p on p.id = v.user_id
  order by v.created_at desc, v.user_id, v.province_id, v.party_id, v.source;

-- Miting düzenle. Yalnızca o il + parti koltuğunun sahibi çağırabilir.
create or replace function public.hold_rally(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_holder   uuid;
  v_last     timestamptz;
  v_votes    int := 100;
  v_bekleme  interval := interval '24 hours';
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'message', 'Önce giriş yapmalısın.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır kilidi.
  select user_id, last_rally_at into v_holder, v_last
  from public.leader_seats
  where province_id = p_province_id and party_id = p_party_id
  for update;

  if not found or v_holder is null then
    return json_build_object('ok', false, 'message', 'Bu koltuğun başkanı yok.');
  end if;

  if v_holder <> v_user_id then
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
  select v_user_id, p_province_id, p_party_id, 'rally'
  from generate_series(1, v_votes);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, v_votes)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + v_votes;

  update public.leader_seats
     set last_rally_at = now()
   where province_id = p_province_id and party_id = p_party_id;

  return json_build_object(
    'ok', true,
    'votes', v_votes,
    'next_rally_at', now() + v_bekleme
  );
end;
$$;

revoke all on function public.hold_rally(text, text) from public;
grant execute on function public.hold_rally(text, text) to authenticated;
