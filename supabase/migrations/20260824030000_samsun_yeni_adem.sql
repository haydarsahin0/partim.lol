-- =============================================================================
-- Samsun · Yeni Parti il başkanlığı → @adem
--
-- Kart artık gerçeği anlatsın diye koltuk oyunun içinde de gerçekten
-- doldruluyor: @adem koltuğu 126 dolar bedelle tutuyor. Bu, oyun için bağlayıcı
-- bir kayıt — koltuğu devralmak isteyen gerçekten en az 127 dolar ödeyecek
-- (next_seat_price mevcut bedelin bir dolar üstünü ister).
--
-- Hesap, oyunun açılış hesaplarından biri olarak işaretli (is_bot): arayüzde
-- yanında beyaz nokta çıkıyor ve sıralamada görünmüyor. Diğer on açılış
-- hesabıyla aynı kural; kimse bunu bir oyuncunun gerçek satın alması sanmasın.
-- =============================================================================

insert into public.profiles (handle, display_name, is_bot, xp, vote_count, created_at, last_seen_at)
values ('adem', 'Adem', true, 640, 47, now() - interval '13 days', now() - interval '1 hour')
on conflict (lower(handle)) do nothing;

/*
 * takeovers = 1: koltuk bir kez el değiştirmiş sayılıyor, kartta "1. kez el
 * değiştirerek aldı" yazması için.
 *
 * on conflict: koltuğu gerçek bir oyuncu almışsa DOKUNMA. Yalnızca boşsa ya da
 * bir açılış hesabındaysa yazılır — parasını ödemiş birinin koltuğunu bir
 * migration'ın elinden alması kabul edilemez.
 */
insert into public.leader_seats
  (province_id, party_id, user_id, price, held_since, takeovers, xp_paid_until)
select 'samsun', 'yeni', p.id, 126, now() - interval '31 hours', 1, now()
from public.profiles p
where lower(p.handle) = 'adem'
  and exists (select 1 from public.provinces where id = 'samsun')
  and exists (select 1 from public.parties   where id = 'yeni')
on conflict (province_id, party_id) do update
  set user_id       = excluded.user_id,
      price         = excluded.price,
      held_since    = excluded.held_since,
      takeovers     = excluded.takeovers,
      xp_paid_until = excluded.xp_paid_until
  where exists (
    select 1 from public.profiles o
    where o.id = public.leader_seats.user_id and o.is_bot
  );

-- Koltuk sayaçlarını gerçek duruma eşitle
update public.profiles p
   set leader_count = coalesce(s.n, 0)
  from (select user_id, count(*) as n from public.leader_seats group by user_id) s
 where s.user_id = p.id and p.leader_count <> s.n;
