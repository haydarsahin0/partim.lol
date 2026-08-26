-- =============================================================================
-- Futbol haritasına Orduspor (Ordu, mor) ve Gençlerbirliği (Ankara) eklendi
--
-- İstemcideki footballTeams.ts ile aynı kayıtlar; oy kullanma ve kulüp
-- başkanlığı football_clubs'tan doğruladığı için DB kopyaları ekleniyor.
-- Ordu'nun jenerik 'Ordu FK' satırı gerçek kulüple (Orduspor) değiştirilir.
-- =============================================================================

set local lock_timeout = '5s';

-- Ordu: jenerik 'Ordu FK' yerine Orduspor (mor)
update public.football_clubs
   set name = 'Orduspor',
       short_name = 'ORD',
       full_name = 'Orduspor',
       color = '#6A0DAD',
       on_tone = 'light',
       founded = 1967
 where id = 'ft-ordu';

-- Ankara'nın ikinci takımı: Gençlerbirliği
insert into public.football_clubs
  (id, province_id, name, short_name, full_name, color, on_tone, major, founded)
values
  ('ft-ankara-genclerbirligi', 'ankara', 'Gençlerbirliği', 'GB', 'Gençlerbirliği Spor Kulübü', '#DA291C', 'light', false, 1923)
on conflict (id) do nothing;
