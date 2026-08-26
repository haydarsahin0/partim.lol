-- =============================================================================
-- İzmir AK Parti başkanlığı hamzadag'dan goztepe'ye devrediliyor
--
-- hamzadag hesabını kaybetmiş; oyuna goztepe kullanıcı adıyla giriyor.
-- Bu göç:
--   1. İzmir × AK Parti koltuğunu goztepe'ye verir
--   2. leader_count sayaçlarını dengeler (eski -1, yeni +1)
--   3. hamzadag'ın XP'sini goztepe'ye aktarır
--
-- NOT: vote_count (oy sayısı) aktarılmıyor — kullanıcının yeni hesabı kendi
-- oylarını biriktiriyor; yalnızca istenen koltuk ve XP taşınıyor.
-- =============================================================================

set local lock_timeout = '5s';

do $$
declare
  v_eski uuid;
  v_yeni uuid;
  v_koltuk_sahibi uuid;
  v_eski_xp bigint;
begin
  select id into v_eski from public.profiles where lower(handle) = 'hamzadag';
  select id into v_yeni from public.profiles where lower(handle) = 'goztepe';

  if v_eski is null then
    raise exception 'hamzadag adında hesap bulunamadı';
  end if;
  if v_yeni is null then
    raise exception 'goztepe adında hesap bulunamadı';
  end if;

  -- Koltuğun şu anki sahibi gerçekten hamzadag mı? (doğrulama)
  select user_id into v_koltuk_sahibi
  from public.leader_seats
  where province_id = 'izmir' and party_id = 'akp';

  if v_koltuk_sahibi is null then
    raise notice 'İzmir AK Parti koltuğu boş — devir yapılmadı, yalnızca XP aktarıldı.';
  elsif v_koltuk_sahibi <> v_eski then
    raise exception 'İzmir AK Parti koltuğu hamzadag''da değil (% değil) — elle inceleyin',
      (select handle from public.profiles where id = v_koltuk_sahibi);
  else
    -- 1) Koltuk devri
    update public.leader_seats
       set user_id = v_yeni
     where province_id = 'izmir' and party_id = 'akp';

    -- 2) Sayaçlar
    update public.profiles
       set leader_count = greatest(0, leader_count - 1)
     where id = v_eski;
    update public.profiles
       set leader_count = leader_count + 1
     where id = v_yeni;
  end if;

  -- 3) XP aktarımı: hamzadag'ın xp'si goztepe'ye eklenir, hamzadag sıfırlanır
  select xp into v_eski_xp from public.profiles where id = v_eski;
  update public.profiles set xp = xp + v_eski_xp where id = v_yeni;
  update public.profiles set xp = 0 where id = v_eski;

  raise notice 'tamam: İzmir AKP koltuğu ve % XP goztepe''ye devredildi', v_eski_xp;
end $$;

-- Doğrulama
select handle, xp, vote_count, leader_count
from public.profiles
where lower(handle) in ('hamzadag', 'goztepe')
order by handle;

select province_id, party_id, user_id, price,
       (select handle from public.profiles p where p.id = ls.user_id) as sahip
from public.leader_seats ls
where province_id = 'izmir' and party_id = 'akp';
