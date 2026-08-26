-- =============================================================================
-- BOT TEMİZLİĞİ — iki aşamalı: önce ÖNİZLEME, sonra UYGULAMA
--
-- NEDEN VAR
--
-- 26.08.2026 canlı analizi: betik ritmiyle (medyan ~62 sn, aralıkların
-- ≥%80'i 50-75 sn bandında) oy atan ~60 hesap tüm oyların ~%47'sini, AKP
-- oylarının ~%60'ını oluşturuyordu. Bu betik bu hesapları aynı kuralla bulur;
-- oy-temizle.sh tek hesap için ne yapıyorsa toplu hâlde yapar:
--
--   1. Sınırsız hak varsa al (yoksa temizlik boşa gider, betik yeniden doldurur)
--   2. province_tallies'i silinen oy kadar DÜŞÜR (yeniden saymak seed'i kaybeder)
--   3. Oyları sil
--   4. Hesap sayaçlarını (vote_count, xp, leader_count) sıfırla
--   5. is_bot = true işaretle → liderlik tablosundan ve site sayacından düşer,
--      arayüzde "bot" rozeti görür, cast_vote artık onu reddeder
--   6. Koltukları bırak (ödenmiş koltuksa operatör karar verir — aşağıya bak)
--
-- KULLANIM
--
--   Supabase → SQL Editor'a yapıştır. Önce 1. bölümü çalıştırıp listeyi gözden
--   geçir; istemediğin hesapları 2. bölümdeki kapsamdan çıkar (ör. ödeme yapan
--   kullanıcılar), sonra 2. bölümü çalıştır.
--
-- AKTİF ÖDEME YAPANLAR (hızlı oy aboneleri) varsayılan olarak DIŞARIDA:
--   otomatik temizlik onları atlar; aşağıda ayrıca listelenirler. Karar
--   operatörün: iade edip kapatmak ya da uyarmak.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ORTAK TESPİT KURALI — iki bölüm de aynı satırları görür.
--
-- Ritim: son oyların aralıkları. İnsan dağınık oy verir; betik zamanlayıcısı
-- milimetrik (medyan 50-75 sn ve aralıkların ≥%80'i o bandın içinde, ya da
-- hızlı oy ritmi: medyan ≤35 sn ve aralıkların ≥%60'ı 10-32 sn içinde).
-- Eşik bilerek yüksek: liste "kesin bot" değil "gözden geçir" listesidir;
-- oyuncu-incele.sh ile tek tek doğrulanabilir.
-- ---------------------------------------------------------------------------

-- 1) ÖNİZLEME ────────────────────────────────────────────────────────────────
-- Hangi hesaplar, hangi partilere kaç oy, koltuk var mı?

with araliklar as (
  select user_id,
         created_at,
         extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
  from public.votes
  where source is distinct from 'rally'
),
istatistik as (
  select user_id,
         count(*)                                      as oy,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric
               / nullif(count(sn), 0), 3)              as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric
               / nullif(count(sn), 0), 3)              as band20,
         min(created_at)                                as ilk_oy,
         max(created_at)                                as son_oy
  from araliklar
  group by user_id
),
tespit as (
  select p.id, p.handle, p.linked_provider,
         (p.fast_votes_until is not null and p.fast_votes_until > now()) as hizli_odeme,
         s.oy, s.medyan, s.band60, s.band20,
         to_char(p.created_at, 'DD.MM HH24:MI') as hesap_acilis,
         to_char(s.ilk_oy, 'DD.MM HH24:MI') as ilk_oy,
         to_char(s.son_oy, 'DD.MM HH24:MI') as son_oy,
         (select count(*) from public.leader_seats k where k.user_id = p.id) as koltuk
  from istatistik s
  join public.profiles p on p.id = s.user_id
  where not coalesce(p.is_bot, false)
    and s.oy >= 30
    and ((s.medyan between 50 and 75 and s.band60 >= 0.8)
         or (s.medyan <= 35 and s.band20 >= 0.6))
)
select handle,
       case when hizli_odeme then 'EVET — ödemeli, karar senin' else 'hayır' end as hizli_odeme,
       oy, round(medyan) as medyan_sn, band60, band20,
       hesap_acilis, ilk_oy, son_oy, koltuk
from tespit
order by oy desc;

-- Aynı listedeki oyların PARTİ kırılımı (AKP payını görmek için):
with araliklar as (
  select user_id, created_at,
         extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
  from public.votes where source is distinct from 'rally'
),
istatistik as (
  select user_id, count(*) as oy,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric / nullif(count(sn),0), 3) as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric / nullif(count(sn),0), 3) as band20
  from araliklar group by user_id
)
select v.party_id, count(*) as oy
from public.votes v
join istatistik s on s.user_id = v.user_id
join public.profiles p on p.id = v.user_id
where not coalesce(p.is_bot, false)
  and v.source is distinct from 'rally'
  and s.oy >= 30
  and ((s.medyan between 50 and 75 and s.band60 >= 0.8) or (s.medyan <= 35 and s.band20 >= 0.6))
group by 1 order by 2 desc;

-- AKTİF HIZLI OY ABONELERİ (temizlik dışı bırakılanlar — gözden geçir):
select p.handle, p.linked_provider, p.vote_count, p.leader_count,
       to_char(p.fast_votes_until, 'DD.MM HH24:MI') as hizli_bitis
from public.profiles p
where p.fast_votes_until is not null and p.fast_votes_until > now()
order by p.vote_count desc;

-- 2) UYGULAMA ────────────────────────────────────────────────────────────────
-- ÖNİZLEMEYİ gözden geçirdikten SONRA çalıştır. Tek işlem: yarıda kalırsa
-- hiçbir şey olmamış gibi geri alınır.
--
-- KAPSAM: yukarıdaki ritim kuralı + "aktif ödeme yapan hariç". Ödemeli bir
-- hesabı da temizlemek istersen aşağıdaki `and not hizli_odeme` satırını sil.
-- KOLTUK: botun elindeki koltuklar serbest bırakılır. Bu koltuklar gerçekten
-- ödenmişse (FB1907PartiBaskani örneği) iade kararı operatörün — koltukları
-- korumak istersen `delete from leader_seats` satırını sil.

do $$
declare
  v_hesap int := 0;
  v_oy    int := 0;
  v_silinen int := 0;
  r       record;
begin
  for r in
    with araliklar as (
      select user_id, created_at,
             extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
      from public.votes where source is distinct from 'rally'
    ),
    istatistik as (
      select user_id, count(*) as oy,
             percentile_cont(0.5) within group (order by sn) as medyan,
             round((count(*) filter (where sn between 50 and 75))::numeric / nullif(count(sn),0), 3) as band60,
             round((count(*) filter (where sn between 10 and 32))::numeric / nullif(count(sn),0), 3) as band20
      from araliklar group by user_id
    )
    select p.id
    from istatistik s
    join public.profiles p on p.id = s.user_id
    where not coalesce(p.is_bot, false)
      and s.oy >= 30
      and ((s.medyan between 50 and 75 and s.band60 >= 0.8)
           or (s.medyan <= 35 and s.band20 >= 0.6))
      and not (p.fast_votes_until is not null and p.fast_votes_until > now())  -- ödemeli hariç
  loop
    -- 1. Sınırsız hak varsa al (temizlik sonrası betik yeniden doldurabilir)
    update public.profiles set unlimited_votes = false where id = r.id;
    delete from public.vote_privileges where profile_id = r.id;

    -- 2. Toplam tabloyu silinen kadar DÜŞÜR (yeniden saymak seed'i kaybeder)
    update public.province_tallies t
       set votes = greatest(0, t.votes - d.n)
      from (
        select province_id, party_id, count(*)::int as n
        from public.votes where user_id = r.id group by 1, 2
      ) d
     where t.province_id = d.province_id and t.party_id = d.party_id;

    -- 3. Oyları sil
    delete from public.votes where user_id = r.id;
    get diagnostics v_silinen = row_count;
    v_oy := v_oy + v_silinen;

    -- 4. Sayaçları sıfırla, bot işaretle (liderlik/sayaçlardan düşer, oy reddedilir)
    update public.profiles
       set vote_count = 0, xp = 0, leader_count = 0,
           is_bot = true,
           suspected_bot_at = coalesce(suspected_bot_at, now())
     where id = r.id;

    -- 5. Koltukları serbest bırak (ödenmişse yukarıdaki uyarıya bak)
    delete from public.leader_seats where user_id = r.id;

    v_hesap := v_hesap + 1;
  end loop;

  raise notice 'temizlenen hesap: %, silinen oy: %', v_hesap, v_oy;
end $$;

-- Doğrulama — kalan şüpheli ritim (yeni hesaplar hariç sıfır olmalı):
select count(*) as kalan_supheli
from public.suspected_vote_bots
where not hizli_odeme_var;
