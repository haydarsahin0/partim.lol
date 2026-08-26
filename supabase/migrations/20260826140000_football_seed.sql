-- =============================================================================
-- Futbol haritası açılış tablosu (seed)
--
-- Her ilin ana takımı 100 oyla başlar (demoBackend'deki baseVotes=100 ile
-- aynı mantık). Böylece harita ilk açılışta boş görünmez ve her il seçilince
-- il detayı açılır. Gerçek oylar bu tohumun ÜZERİNE eklenir.
--
-- NOT: Tohum ayrı tabloda tutulmaz (siyasi seed_tallies gibi); doğrudan
-- football_tallies'e yazılır çünkü futbol tohumu tektip (her ilde ana takım
-- 100) ve yeniden üretimi basit. Migration yeniden çalışırsa tekrar eklenir;
-- oylar bu satırların üstüne biriktiği için sorun olmaz.
-- =============================================================================

set local lock_timeout = '5s';

-- Her ilin ana takımı yoksa 100 oyla başlat. Mevcut satırlara dokunulmaz
-- (gerçek oylar korunur); yalnızca EKSİK il-takım çiftleri eklenir.
insert into public.football_tallies (province_id, club_id, votes)
select x.province_id, x.club_id, x.votes
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
) as x(province_id, club_id, votes)
where not exists (
  select 1 from public.football_tallies t
  where t.province_id = x.province_id and t.club_id = x.club_id
);

-- Doğrulama
select count(*) as futbol_seed_satiri from public.football_tallies;
