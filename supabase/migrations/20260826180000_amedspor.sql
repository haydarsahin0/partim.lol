-- =============================================================================
-- Amedspor futbol haritasına ekleniyor (Diyarbakır'ın ikinci takımı)
--
-- İstemcideki footballTeams.ts ile aynı kayıt; oy kullanma ve kulüp başkanlığı
-- football_clubs'tan doğruladığı için DB kopyası da ekleniyor.
-- =============================================================================

set local lock_timeout = '5s';

insert into public.football_clubs
  (id, province_id, name, short_name, full_name, color, on_tone, major, founded)
values
  ('ft-diyarbakir-amedspor', 'diyarbakir', 'Amedspor', 'AMED', 'Amedspor', '#FFB300', 'dark', false, 1990)
on conflict (id) do nothing;
