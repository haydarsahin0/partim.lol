-- =============================================================================
-- Bot işareti kaldırma: yenipartii ve FB1907PartiBaskani
--
-- Bu iki hesap bot temizliğinde yanlışlıkla is_bot = true işaretlenmiş;
-- gerçek kullanıcılar. İşaret kaldırılınca tekrar oy kullanabilirler
-- (cast_vote is_bot'u reddediyordu). suspected_bot_at damgası da temizleniyor.
--
-- Sayaçlar (vote_count, xp) dokunulmuyor: temizlik sırasında sıfırlandıysa
-- yeniden oy verdikçe birikir; veri yoksa geri getirilemez.
-- =============================================================================

set local lock_timeout = '5s';

update public.profiles
   set is_bot = false,
       suspected_bot_at = null
 where lower(handle) in ('yenipartii', 'fb1907partibaskani');

-- Doğrulama
select handle, is_bot, suspected_bot_at, vote_count, xp
from public.profiles
where lower(handle) in ('yenipartii', 'fb1907partibaskani');
