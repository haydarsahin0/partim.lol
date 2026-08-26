-- =============================================================================
-- Futbol açılış tohumunu geri al: her takımın görünen 100 oyunu sıfırla
--
-- 20260826140000 göçü her ilin ana takımına 100 oy koymuştu; istenen
-- davranış haritanın SIFIRDAN başlaması. Gerçek oylar (kullanıcıların attığı)
-- korunur: yalnızca tohum değeri düşülür, sıfıra inen satırlar silinir.
-- =============================================================================

set local lock_timeout = '5s';

-- Tohum değerini düş (gerçek oy varsa üstünde kalır)
update public.football_tallies t
   set votes = greatest(0, t.votes - s.votes)
  from (values
('adana', 'ft-adana', 100),
  ('adiyaman', 'ft-adiyaman', 100),
  ('afyonkarahisar', 'ft-afyonkarahisar', 100),
  ('agri', 'ft-agri', 100),
  ('amasya', 'ft-amasya', 100),
  ('ankara', 'ft-ankara', 100),
  ('antalya', 'ft-antalya', 100),
  ('artvin', 'ft-artvin', 100),
  ('aydin', 'ft-aydin', 100),
  ('balikesir', 'ft-balikesir', 100),
  ('bilecik', 'ft-bilecik', 100),
  ('bingol', 'ft-bingol', 100),
  ('bitlis', 'ft-bitlis', 100),
  ('bolu', 'ft-bolu', 100),
  ('burdur', 'ft-burdur', 100),
  ('bursa', 'ft-bursa', 100),
  ('canakkale', 'ft-canakkale', 100),
  ('cankiri', 'ft-cankiri', 100),
  ('corum', 'ft-corum', 100),
  ('denizli', 'ft-denizli', 100),
  ('diyarbakir', 'ft-diyarbakir', 100),
  ('edirne', 'ft-edirne', 100),
  ('elazig', 'ft-elazig', 100),
  ('erzincan', 'ft-erzincan', 100),
  ('erzurum', 'ft-erzurum', 100),
  ('eskisehir', 'ft-eskisehir', 100),
  ('gaziantep', 'ft-gaziantep', 100),
  ('giresun', 'ft-giresun', 100),
  ('gumushane', 'ft-gumushane', 100),
  ('hakkari', 'ft-hakkari', 100),
  ('hatay', 'ft-hatay', 100),
  ('isparta', 'ft-isparta', 100),
  ('mersin', 'ft-mersin', 100),
  ('istanbul', 'ft-istanbul-galatasaray', 100),
  ('izmir', 'ft-izmir', 100),
  ('kars', 'ft-kars', 100),
  ('kastamonu', 'ft-kastamonu', 100),
  ('kayseri', 'ft-kayseri', 100),
  ('kirklareli', 'ft-kirklareli', 100),
  ('kirsehir', 'ft-kirsehir', 100),
  ('kocaeli', 'ft-kocaeli', 100),
  ('konya', 'ft-konya', 100),
  ('kutahya', 'ft-kutahya', 100),
  ('malatya', 'ft-malatya', 100),
  ('manisa', 'ft-manisa', 100),
  ('kahramanmaras', 'ft-kahramanmaras', 100),
  ('mardin', 'ft-mardin', 100),
  ('mugla', 'ft-mugla', 100),
  ('mus', 'ft-mus', 100),
  ('nevsehir', 'ft-nevsehir', 100),
  ('nigde', 'ft-nigde', 100),
  ('ordu', 'ft-ordu', 100),
  ('rize', 'ft-rize', 100),
  ('sakarya', 'ft-sakarya', 100),
  ('samsun', 'ft-samsun', 100),
  ('siirt', 'ft-siirt', 100),
  ('sinop', 'ft-sinop', 100),
  ('sivas', 'ft-sivas', 100),
  ('tekirdag', 'ft-tekirdag', 100),
  ('tokat', 'ft-tokat', 100),
  ('trabzon', 'ft-trabzon-trabzonspor', 100),
  ('tunceli', 'ft-tunceli', 100),
  ('sanliurfa', 'ft-sanliurfa', 100),
  ('usak', 'ft-usak', 100),
  ('van', 'ft-van', 100),
  ('yozgat', 'ft-yozgat', 100),
  ('zonguldak', 'ft-zonguldak', 100),
  ('aksaray', 'ft-aksaray', 100),
  ('bayburt', 'ft-bayburt', 100),
  ('karaman', 'ft-karaman', 100),
  ('kirikkale', 'ft-kirikkale', 100),
  ('batman', 'ft-batman', 100),
  ('sirnak', 'ft-sirnak', 100),
  ('bartin', 'ft-bartin', 100),
  ('ardahan', 'ft-ardahan', 100),
  ('igdir', 'ft-igdir', 100),
  ('yalova', 'ft-yalova', 100),
  ('karabuk', 'ft-karabuk', 100),
  ('kilis', 'ft-kilis', 100),
  ('osmaniye', 'ft-osmaniye', 100),
  ('duzce', 'ft-duzce', 100)
  ) as s(province_id, club_id, votes)
 where t.province_id = s.province_id and t.club_id = s.club_id;

-- Sıfıra inen satırları temizle
delete from public.football_tallies where votes = 0;

-- Doğrulama: toplam oy artık yalnızca gerçek oylar
select coalesce(sum(votes), 0) as futbol_toplam_oy from public.football_tallies;
