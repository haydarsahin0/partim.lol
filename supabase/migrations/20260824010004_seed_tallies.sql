-- =============================================================================
-- Açılış oy tablosu  —  ÜRETİLMİŞ DOSYA, ELLE DÜZENLEMEYİN
--
--   node scripts/generate-seed-sql.mjs
--
-- Yüzdeler ve dağıtım algoritması src/data/seedShares.ts içinde. Ülke geneli
-- yüzdeleri tam tutturulur; bölgesel eğilim yalnızca illere dağılımı değiştirir.
-- Toplam 365 oy, 193 satır.
--
-- SAYAÇ SIFIRDAN KURULUR, eskisinden çıkarma yapılmaz.
--
-- Önce "önceki tohumu düş, yenisini ekle" yapıyorduk. Bu, province_tallies'e
-- yalnızca tohum üzerinden dokunulduğunu varsayıyordu — ve varsayım yanlıştı:
-- eski bir migration (bot koltukları) tabloya doğrudan ~1.900 oy yazmıştı,
-- hiçbir yerde kayıtlı olmadığı için de hiçbir zaman düşülmedi. Sonuç: toplam
-- oy hedeflenenin çok üstünde kaldı ve sıralamanın başı yanlış partide takıldı.
--
-- Artık sayaç iki doğrulanabilir kaynaktan yeniden kuruluyor:
--   public.votes        oyuncuların gerçekten kullandığı her oy
--   public.seed_tallies aşağıdaki açılış tablosu
-- Aradan ne geçmiş olursa olsun sonuç aynı yere oturur; migration kaç kez
-- çalışırsa çalışsın fark etmez.
-- =============================================================================

create table if not exists public.seed_tallies (
  province_id text not null references public.provinces (id) on delete cascade,
  party_id    text not null references public.parties   (id) on delete cascade,
  votes       int  not null check (votes >= 0),
  primary key (province_id, party_id)
);

alter table public.seed_tallies enable row level security;
-- Politika yok: istemci okumaz, yalnızca migration yazar.

-- 1) Açılış tablosunu yenisiyle değiştir
delete from public.seed_tallies;
insert into public.seed_tallies (province_id, party_id, votes) values
  ('afyonkarahisar', 'yeni', 2),
  ('afyonkarahisar', 'akp', 1),
  ('afyonkarahisar', 'mhp', 2),
  ('afyonkarahisar', 'iyi', 3),
  ('afyonkarahisar', 'memleket', 1),
  ('afyonkarahisar', 'chp', 1),
  ('afyonkarahisar', 'tip', 1),
  ('afyonkarahisar', 'gelecek', 1),
  ('ankara', 'yeni', 10),
  ('ankara', 'akp', 7),
  ('ankara', 'mhp', 2),
  ('ankara', 'yrp', 1),
  ('ankara', 'anahtar', 1),
  ('ankara', 'sp', 1),
  ('ankara', 'gelecek', 1),
  ('ankara', 'zafer', 1),
  ('artvin', 'yeni', 2),
  ('artvin', 'akp', 2),
  ('artvin', 'iyi', 1),
  ('artvin', 'yrp', 1),
  ('artvin', 'memleket', 1),
  ('artvin', 'deva', 1),
  ('artvin', 'dp', 1),
  ('artvin', 'bbp', 1),
  ('aydin', 'yeni', 4),
  ('aydin', 'akp', 3),
  ('aydin', 'iyi', 2),
  ('aydin', 'memleket', 1),
  ('aydin', 'chp', 2),
  ('balikesir', 'yeni', 5),
  ('balikesir', 'akp', 4),
  ('balikesir', 'mhp', 1),
  ('balikesir', 'iyi', 1),
  ('balikesir', 'yrp', 1),
  ('balikesir', 'chp', 1),
  ('balikesir', 'tip', 1),
  ('balikesir', 'deva', 1),
  ('balikesir', 'zafer', 1),
  ('bolu', 'yeni', 5),
  ('bolu', 'akp', 3),
  ('bolu', 'mhp', 2),
  ('bolu', 'iyi', 1),
  ('bolu', 'yrp', 1),
  ('bolu', 'memleket', 1),
  ('bolu', 'dp', 1),
  ('bursa', 'yeni', 4),
  ('bursa', 'akp', 4),
  ('bursa', 'mhp', 1),
  ('bursa', 'iyi', 1),
  ('bursa', 'yrp', 1),
  ('bursa', 'dem', 1),
  ('bursa', 'anahtar', 1),
  ('bursa', 'chp', 1),
  ('bursa', 'sp', 1),
  ('bursa', 'dp', 1),
  ('corum', 'yeni', 8),
  ('corum', 'akp', 4),
  ('corum', 'mhp', 1),
  ('corum', 'anahtar', 1),
  ('corum', 'bbp', 1),
  ('gaziantep', 'yeni', 4),
  ('gaziantep', 'akp', 1),
  ('gaziantep', 'yrp', 1),
  ('gaziantep', 'dem', 2),
  ('gaziantep', 'memleket', 1),
  ('gaziantep', 'anahtar', 1),
  ('gaziantep', 'tip', 1),
  ('gaziantep', 'sp', 1),
  ('gaziantep', 'deva', 1),
  ('gaziantep', 'gelecek', 1),
  ('gaziantep', 'hudapar', 1),
  ('isparta', 'yeni', 5),
  ('isparta', 'akp', 2),
  ('isparta', 'mhp', 1),
  ('isparta', 'iyi', 1),
  ('isparta', 'memleket', 1),
  ('isparta', 'tip', 1),
  ('isparta', 'sp', 1),
  ('isparta', 'deva', 1),
  ('isparta', 'dp', 1),
  ('mersin', 'yeni', 3),
  ('mersin', 'akp', 4),
  ('mersin', 'mhp', 1),
  ('mersin', 'iyi', 1),
  ('mersin', 'yrp', 1),
  ('mersin', 'anahtar', 1),
  ('mersin', 'chp', 1),
  ('mersin', 'tip', 1),
  ('mersin', 'deva', 1),
  ('mersin', 'gelecek', 1),
  ('istanbul', 'yeni', 8),
  ('istanbul', 'akp', 9),
  ('istanbul', 'mhp', 4),
  ('istanbul', 'iyi', 1),
  ('istanbul', 'yrp', 2),
  ('istanbul', 'dem', 1),
  ('istanbul', 'memleket', 1),
  ('istanbul', 'chp', 1),
  ('istanbul', 'tip', 2),
  ('istanbul', 'sp', 1),
  ('istanbul', 'gelecek', 1),
  ('istanbul', 'dp', 1),
  ('istanbul', 'zafer', 1),
  ('kars', 'yeni', 2),
  ('kars', 'akp', 2),
  ('kars', 'mhp', 1),
  ('kars', 'yrp', 1),
  ('kars', 'dem', 3),
  ('kocaeli', 'yeni', 2),
  ('kocaeli', 'akp', 5),
  ('kocaeli', 'iyi', 2),
  ('kocaeli', 'yrp', 1),
  ('kocaeli', 'memleket', 1),
  ('kocaeli', 'chp', 1),
  ('konya', 'yeni', 3),
  ('konya', 'akp', 4),
  ('konya', 'mhp', 3),
  ('konya', 'anahtar', 1),
  ('konya', 'sp', 1),
  ('konya', 'dp', 1),
  ('konya', 'bbp', 1),
  ('konya', 'zafer', 1),
  ('manisa', 'yeni', 4),
  ('manisa', 'mhp', 1),
  ('manisa', 'iyi', 2),
  ('manisa', 'yrp', 1),
  ('manisa', 'memleket', 1),
  ('manisa', 'anahtar', 1),
  ('manisa', 'tip', 1),
  ('manisa', 'zafer', 1),
  ('rize', 'yeni', 3),
  ('rize', 'akp', 2),
  ('rize', 'mhp', 1),
  ('sakarya', 'yeni', 3),
  ('sakarya', 'akp', 1),
  ('sakarya', 'mhp', 1),
  ('sakarya', 'iyi', 1),
  ('sakarya', 'yrp', 1),
  ('sakarya', 'anahtar', 1),
  ('sakarya', 'chp', 1),
  ('sakarya', 'sp', 1),
  ('sakarya', 'gelecek', 1),
  ('sinop', 'yeni', 9),
  ('sinop', 'akp', 3),
  ('sinop', 'mhp', 1),
  ('sinop', 'iyi', 1),
  ('trabzon', 'yeni', 6),
  ('trabzon', 'akp', 2),
  ('trabzon', 'mhp', 2),
  ('trabzon', 'yrp', 1),
  ('trabzon', 'memleket', 1),
  ('trabzon', 'anahtar', 1),
  ('trabzon', 'deva', 1),
  ('sanliurfa', 'yeni', 3),
  ('sanliurfa', 'akp', 1),
  ('sanliurfa', 'yrp', 1),
  ('sanliurfa', 'dem', 4),
  ('sanliurfa', 'memleket', 1),
  ('sanliurfa', 'anahtar', 1),
  ('sanliurfa', 'tip', 1),
  ('sanliurfa', 'sp', 1),
  ('sanliurfa', 'deva', 1),
  ('sanliurfa', 'gelecek', 1),
  ('sanliurfa', 'hudapar', 1),
  ('usak', 'yeni', 5),
  ('usak', 'akp', 2),
  ('usak', 'iyi', 2),
  ('usak', 'memleket', 1),
  ('usak', 'chp', 2),
  ('usak', 'tip', 1),
  ('zonguldak', 'yeni', 5),
  ('zonguldak', 'akp', 1),
  ('zonguldak', 'mhp', 2),
  ('zonguldak', 'iyi', 1),
  ('zonguldak', 'anahtar', 1),
  ('zonguldak', 'sp', 1),
  ('zonguldak', 'bbp', 1),
  ('bartin', 'yeni', 8),
  ('bartin', 'akp', 2),
  ('bartin', 'mhp', 2),
  ('bartin', 'yrp', 1),
  ('bartin', 'deva', 1),
  ('karabuk', 'yeni', 2),
  ('karabuk', 'akp', 4),
  ('karabuk', 'mhp', 2),
  ('karabuk', 'iyi', 1),
  ('karabuk', 'bbp', 1),
  ('kilis', 'yeni', 1),
  ('kilis', 'akp', 3),
  ('kilis', 'yrp', 1),
  ('kilis', 'dem', 4),
  ('kilis', 'memleket', 1),
  ('kilis', 'hudapar', 1)
on conflict (province_id, party_id) do update set votes = excluded.votes;

-- 2) Sayacı sıfırdan kur: önce gerçek oylar
delete from public.province_tallies;

insert into public.province_tallies (province_id, party_id, votes)
select province_id, party_id, count(*)::int
from public.votes
group by province_id, party_id;

-- 3) Üstüne açılış tablosu
insert into public.province_tallies (province_id, party_id, votes)
select province_id, party_id, votes from public.seed_tallies
on conflict (province_id, party_id)
  do update set votes = public.province_tallies.votes + excluded.votes;
