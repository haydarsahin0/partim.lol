-- =============================================================================
-- Beşiktaş rengi: siyah koyu arka planda kayboluyordu, beyaza çekildi
--
-- İstemcideki footballTeams.ts ile birebir aynı değişiklik; koltuk satın alma
-- ve diğer sunucu taraflı görünümler de aynı rengi kullansın diye DB kopyası
-- güncelleniyor.
-- =============================================================================

set local lock_timeout = '5s';

update public.football_clubs
   set color = '#F5F5F5', on_tone = 'dark'
 where id = 'ft-istanbul-besiktas';
