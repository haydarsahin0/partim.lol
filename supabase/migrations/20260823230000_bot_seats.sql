-- =============================================================================
-- Açılış başkanları (bot)
--
-- Boş bir tabloda hiçbir koltuk dolu değilken oyunun çekiciliği görünmüyor:
-- kimse kimseden bir şey devralmıyor. Büyük illerdeki bazı koltukları oyunun
-- kendi hesaplarıyla $1 seviyesinden dolduruyoruz; böylece gerçek oyuncu için
-- devralma bedeli $2 oluyor ve fiyat merdiveni oradan yürüyor.
--
-- Botlar AÇIKÇA İŞARETLİ (profiles.is_bot) ve arayüzde "bot" rozetiyle
-- gösteriliyor. Gerçek oyuncu gibi göstermek, koltuğu devralmak için parayla
-- ödeme yapan birini yanıltmak olurdu; koltuğun dolu olması zaten yeterli
-- rekabet hissini veriyor, sahibinin kim olduğunu saklamaya gerek yok.
--
-- Botların:
--   - auth_user_id ve device_id'si YOK — hiçbir oturum bu hesaplara düşemez.
--   - site sayaçlarına (site_stats) dâhil değiller; "çevrimiçi" ve "toplam
--     kullanıcı" rakamları gerçek insanları sayar.
-- =============================================================================

alter table public.profiles
  add column if not exists is_bot boolean not null default false;

create index if not exists profiles_bot_idx on public.profiles (is_bot) where is_bot;

-- Sayaçlar yalnızca gerçek kullanıcıyı saysın
create or replace view public.site_stats
with (security_invoker = true) as
  select
    (select count(*) from public.profiles
      where not is_bot and last_seen_at > now() - interval '5 minutes') as online,
    (select count(*) from public.profiles where not is_bot) as total;

-- ------------------------------ bot hesapları ---------------------------------

insert into public.profiles (handle, display_name, is_bot, xp, vote_count, created_at, last_seen_at)
values
  ('deniz_34',   'Deniz',      true, 420, 38, now() - interval '9 days',  now() - interval '2 hours'),
  ('emirhan_k',  'Emirhan',    true, 380, 31, now() - interval '8 days',  now() - interval '5 hours'),
  ('serap_ist',  'Serap',      true, 350, 27, now() - interval '7 days',  now() - interval '1 hour'),
  ('mert_06',    'Mert',       true, 610, 44, now() - interval '11 days', now() - interval '3 hours'),
  ('zeynep_35',  'Zeynep',     true, 290, 22, now() - interval '6 days',  now() - interval '7 hours'),
  ('kaan_ege',   'Kaan',       true, 240, 19, now() - interval '5 days',  now() - interval '4 hours'),
  ('burak_16',   'Burak',      true, 480, 35, now() - interval '10 days', now() - interval '6 hours'),
  ('elif_07',    'Elif',       true, 200, 16, now() - interval '4 days',  now() - interval '8 hours'),
  ('okan_ank',   'Okan',       true, 530, 41, now() - interval '12 days', now() - interval '2 hours'),
  ('tuna_izm',   'Tuna',       true, 310, 25, now() - interval '6 days',  now() - interval '9 hours')
on conflict (lower(handle)) do nothing;

-- ------------------------------ açılış koltukları -----------------------------

/*
 * price = 1: gerçek oyuncu için devralma bedeli $2 olur (next_seat_price
 * mevcut bedelin $1 fazlasını ister). takeovers = 0: koltuk hiç el
 * değiştirmedi, "ilk sahibi" anlamında.
 *
 * `on conflict do nothing`: gerçek bir oyuncunun aldığı koltuğun üstüne asla
 * yazmaz. Bu migration birden çok kez çalışsa da bir daha bir şey değişmez.
 */
insert into public.leader_seats
  (province_id, party_id, user_id, price, held_since, takeovers, xp_paid_until)
select
  v.province_id,
  v.party_id,
  p.id,
  1,
  now() - (v.saat || ' hours')::interval,
  0,
  now()
from (values
  ('istanbul', 'chp',      'deniz_34',  62),
  ('istanbul', 'akp',      'emirhan_k', 55),
  ('istanbul', 'iyi',      'serap_ist', 41),
  ('istanbul', 'dem',      'kaan_ege',  33),
  ('ankara',   'akp',      'mert_06',   58),
  ('ankara',   'chp',      'okan_ank',  47),
  ('ankara',   'mhp',      'burak_16',  29),
  ('izmir',    'chp',      'tuna_izm',  51),
  ('izmir',    'akp',      'zeynep_35', 36),
  ('izmir',    'memleket', 'elif_07',   24),
  ('bursa',    'akp',      'burak_16',  44),
  ('bursa',    'mhp',      'emirhan_k', 19),
  ('antalya',  'chp',      'deniz_34',  38),
  ('antalya',  'iyi',      'kaan_ege',  15)
) as v(province_id, party_id, handle, saat)
join public.profiles p on lower(p.handle) = v.handle and p.is_bot
where exists (select 1 from public.provinces where id = v.province_id)
  and exists (select 1 from public.parties   where id = v.party_id)
on conflict (province_id, party_id) do nothing;

-- Koltuk sayaçlarını gerçekten tutulan koltuklara eşitle
update public.profiles p
   set leader_count = coalesce(s.n, 0)
  from (
    select user_id, count(*) as n from public.leader_seats group by user_id
  ) s
 where s.user_id = p.id
   and p.leader_count <> s.n;

-- Botlara oy da yazalım ki durdukları iller boş görünmesin
insert into public.province_tallies (province_id, party_id, votes)
select v.province_id, v.party_id, v.oy
from (values
  ('istanbul', 'chp', 180), ('istanbul', 'akp', 165), ('istanbul', 'iyi', 74),
  ('istanbul', 'dem', 96),  ('istanbul', 'mhp', 58),
  ('ankara',   'akp', 152), ('ankara',   'chp', 148), ('ankara',   'mhp', 71),
  ('ankara',   'iyi', 49),
  ('izmir',    'chp', 194), ('izmir',    'akp', 96),  ('izmir',    'memleket', 44),
  ('izmir',    'iyi', 52),
  ('bursa',    'akp', 121), ('bursa',    'mhp', 63),  ('bursa',    'chp', 88),
  ('antalya',  'chp', 134), ('antalya',  'iyi', 57),  ('antalya',  'akp', 92)
) as v(province_id, party_id, oy)
on conflict (province_id, party_id) do nothing;
