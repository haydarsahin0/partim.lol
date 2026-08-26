-- =============================================================================
-- Futbol haritası gerçek moda taşınıyor: ayrı tablolar + kulüp başkanlığı
--
-- Siyasi haritadaki oy/koltuk verisiyle karışmaması için futbolun kendi
-- tabloları var (football_*). Aynı kuralların futbol karşılıkları:
--
--   - football_cast_vote    oy kullanma (1 dk soğuma, hızlı oy 15 sn,
--                           anonim tavan, ritim koruması — siyasiyle aynı)
--   - football_claim_seat   kulüp başkanlığı satın alma ($1'den başlar,
--                           devralma mevcut bedelin $1 fazlasına)
--   - football_daily_votes  kulüp başkanının GÜNDE 60 oy hakkı (mitingin
--                           futbol karşılığı; siyaside 100/24sa, burada 60/24sa)
--   - football_create_club  kullanıcının kurduğu kulüp (haftalık $19 abonelik)
--
-- SABİTLER:
--   günlük oy hakkı    = 60 (kulüp başkanı)
--   başlangıç bedeli   = $1; devralma = mevcut + $1
--   oy soğuması        = 1 dk (hızlı oy: 15 sn)
-- =============================================================================

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Kulüpler: sabit takımlar + kullanıcı kulüpleri
-- ---------------------------------------------------------------------------
create table if not exists public.football_clubs (
  id           text primary key,
  province_id  text not null,
  name         text not null,
  short_name   text not null,
  full_name    text not null,
  color        text not null,
  on_tone      text not null default 'light' check (on_tone in ('light','dark')),
  major        boolean not null default false,
  founded      int,
  custom       boolean not null default false,
  owner_id     uuid references public.profiles (id) on delete cascade,
  logo_url     text,
  created_at   timestamptz not null default now()
);

create index if not exists football_clubs_province_idx on public.football_clubs (province_id);

-- ---------------------------------------------------------------------------
-- 2. Futbol oyları ve toplamlar
-- ---------------------------------------------------------------------------
create table if not exists public.football_votes (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  province_id text not null,
  club_id     text not null references public.football_clubs (id),
  created_at  timestamptz not null default now(),
  source      text not null default 'vote' check (source in ('vote','daily'))
);

create index if not exists football_votes_user_idx
  on public.football_votes (user_id, created_at desc);
create index if not exists football_votes_province_idx
  on public.football_votes (province_id, created_at desc);

create table if not exists public.football_tallies (
  province_id text not null,
  club_id     text not null references public.football_clubs (id),
  votes       int  not null default 0 check (votes >= 0),
  primary key (province_id, club_id)
);

-- ---------------------------------------------------------------------------
-- 3. Kulüp başkanlığı koltukları (siyasi leader_seats'in futbol karşılığı)
-- ---------------------------------------------------------------------------
create table if not exists public.football_seats (
  province_id   text not null,
  club_id       text not null references public.football_clubs (id),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  price         numeric(10, 2) not null check (price > 0),
  held_since    timestamptz not null default now(),
  takeovers     int not null default 1,
  last_daily_at timestamptz,          -- günlük 60 oy hakkının son kullanımı
  primary key (province_id, club_id)
);

create index if not exists football_seats_user_idx on public.football_seats (user_id);

-- Stripe ödeme kayıt defteri (webhook tekrarına karşı)
create table if not exists public.football_seat_purchases (
  stripe_session_id text primary key,
  user_id           uuid not null,
  province_id       text not null,
  club_id           text not null,
  amount_usd        numeric(10, 2) not null,
  status            text not null default 'applied' check (status in ('applied','stale')),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Sabit takımlar (footballTeams.ts ile birebir aynı liste)
-- ---------------------------------------------------------------------------
INSERT INTO public.football_clubs
  (id, province_id, name, short_name, full_name, color, on_tone, major, founded)
VALUES
  ('ft-istanbul-galatasaray', 'istanbul', 'Galatasaray', 'GS', 'Galatasaray Spor Kulübü', '#A32638', 'light', true, 1905),
  ('ft-istanbul-fenerbahce', 'istanbul', 'Fenerbahçe', 'FB', 'Fenerbahçe Spor Kulübü', '#003E7E', 'light', true, 1907),
  ('ft-istanbul-besiktas', 'istanbul', 'Beşiktaş', 'BJK', 'Beşiktaş Jimnastik Kulübü', '#0B0B0B', 'light', true, 1903),
  ('ft-trabzon-trabzonspor', 'trabzon', 'Trabzonspor', 'TS', 'Trabzonspor Kulübü', '#81007F', 'light', true, 1967),
  ('ft-adana', 'adana', 'Adana Demirspor', 'ADS', 'Adana Demirspor', '#0066B3', 'light', false, 1940),
  ('ft-adiyaman', 'adiyaman', 'Adıyaman FK', 'ADI', 'Adıyaman Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-afyonkarahisar', 'afyonkarahisar', 'Afyonkarahisar FK', 'AFY', 'Afyonkarahisar Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-agri', 'agri', 'Ağrı FK', 'AĞR', 'Ağrı Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-amasya', 'amasya', 'Amasya FK', 'AMA', 'Amasya Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-ankara', 'ankara', 'Ankaragücü', 'AG', 'MKE Ankaragücü', '#FDB913', 'dark', false, 1910),
  ('ft-antalya', 'antalya', 'Antalyaspor', 'ANT', 'Antalyaspor', '#C8102E', 'light', false, 1966),
  ('ft-artvin', 'artvin', 'Artvin FK', 'ART', 'Artvin Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-aydin', 'aydin', 'Aydın FK', 'AYD', 'Aydın Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-balikesir', 'balikesir', 'Balıkesir FK', 'BAL', 'Balıkesir Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bilecik', 'bilecik', 'Bilecik FK', 'BİL', 'Bilecik Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bingol', 'bingol', 'Bingöl FK', 'BİN', 'Bingöl Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bitlis', 'bitlis', 'Bitlis FK', 'BİT', 'Bitlis Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bolu', 'bolu', 'Bolu FK', 'BOL', 'Bolu Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-burdur', 'burdur', 'Burdur FK', 'BUR', 'Burdur Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bursa', 'bursa', 'Bursaspor', 'BUR', 'Bursaspor Kulübü', '#008000', 'light', false, 1963),
  ('ft-canakkale', 'canakkale', 'Çanakkale Dardanelspor', 'ÇD', 'Çanakkale Dardanelspor', '#00457C', 'light', false, 1927),
  ('ft-cankiri', 'cankiri', 'Çankırı FK', 'ÇAN', 'Çankırı Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-corum', 'corum', 'Çorum FK', 'ÇOR', 'Çorum Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-denizli', 'denizli', 'Denizli FK', 'DEN', 'Denizli Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-diyarbakir', 'diyarbakir', 'Diyarbakırspor', 'DİY', 'Diyarbakırspor', '#FF0000', 'light', false, 1968),
  ('ft-edirne', 'edirne', 'Edirne FK', 'EDİ', 'Edirne Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-elazig', 'elazig', 'Elazığ FK', 'ELA', 'Elazığ Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-erzincan', 'erzincan', 'Erzincan FK', 'ERZ', 'Erzincan Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-erzurum', 'erzurum', 'Erzurum FK', 'ERZ', 'Erzurum Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-eskisehir', 'eskisehir', 'Eskişehirspor', 'ES', 'Eskişehirspor', '#D71920', 'light', false, 1965),
  ('ft-gaziantep', 'gaziantep', 'Gaziantep FK', 'GAF', 'Gaziantep Futbol Kulübü', '#E30A17', 'light', false, 1988),
  ('ft-giresun', 'giresun', 'Giresun FK', 'GİR', 'Giresun Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-gumushane', 'gumushane', 'Gümüşhane FK', 'GÜM', 'Gümüşhane Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-hakkari', 'hakkari', 'Hakkâri FK', 'HAK', 'Hakkâri Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-hatay', 'hatay', 'Hatayspor', 'HAT', 'Hatayspor', '#4B0082', 'light', false, 1967),
  ('ft-isparta', 'isparta', 'Isparta FK', 'ISP', 'Isparta Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-mersin', 'mersin', 'Mersin FK', 'MER', 'Mersin Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-izmir', 'izmir', 'Göztepe', 'GÖZ', 'Göztepe Spor Kulübü', '#C8102E', 'light', false, 1925),
  ('ft-kars', 'kars', 'Kars FK', 'KAR', 'Kars Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kastamonu', 'kastamonu', 'Kastamonu FK', 'KAS', 'Kastamonu Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kayseri', 'kayseri', 'Kayserispor', 'KAY', 'Kayserispor', '#FF0000', 'light', false, 1966),
  ('ft-kirklareli', 'kirklareli', 'Kırklareli FK', 'KIR', 'Kırklareli Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kirsehir', 'kirsehir', 'Kırşehir FK', 'KIR', 'Kırşehir Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kocaeli', 'kocaeli', 'Kocaelispor', 'KOC', 'Kocaelispor', '#0066B3', 'light', false, 1966),
  ('ft-konya', 'konya', 'Konyaspor', 'KON', 'Konyaspor', '#006600', 'light', false, 1922),
  ('ft-kutahya', 'kutahya', 'Kütahya FK', 'KÜT', 'Kütahya Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-malatya', 'malatya', 'Yeni Malatyaspor', 'YMS', 'Yeni Malatyaspor', '#FFD100', 'dark', false, 1986),
  ('ft-manisa', 'manisa', 'Manisa FK', 'MAN', 'Manisa Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kahramanmaras', 'kahramanmaras', 'Kahramanmaraş FK', 'KAH', 'Kahramanmaraş Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-mardin', 'mardin', 'Mardin FK', 'MAR', 'Mardin Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-mugla', 'mugla', 'Muğla FK', 'MUĞ', 'Muğla Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-mus', 'mus', 'Muş FK', 'MUŞ', 'Muş Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-nevsehir', 'nevsehir', 'Nevşehir FK', 'NEV', 'Nevşehir Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-nigde', 'nigde', 'Niğde FK', 'NİĞ', 'Niğde Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-ordu', 'ordu', 'Ordu FK', 'ORD', 'Ordu Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-rize', 'rize', 'Çaykur Rizespor', 'ÇRZ', 'Çaykur Rizespor', '#005C9A', 'light', false, 1953),
  ('ft-sakarya', 'sakarya', 'Sakarya FK', 'SAK', 'Sakarya Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-samsun', 'samsun', 'Samsunspor', 'SAM', 'Samsunspor', '#C8102E', 'light', false, 1965),
  ('ft-siirt', 'siirt', 'Siirt FK', 'Sİİ', 'Siirt Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-sinop', 'sinop', 'Sinop FK', 'SİN', 'Sinop Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-sivas', 'sivas', 'Sivasspor', 'SİV', 'Sivasspor', '#D71920', 'light', false, 1967),
  ('ft-tekirdag', 'tekirdag', 'Tekirdağ FK', 'TEK', 'Tekirdağ Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-tokat', 'tokat', 'Tokat FK', 'TOK', 'Tokat Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-tunceli', 'tunceli', 'Tunceli FK', 'TUN', 'Tunceli Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-sanliurfa', 'sanliurfa', 'Şanlıurfa FK', 'ŞAN', 'Şanlıurfa Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-usak', 'usak', 'Uşak FK', 'UŞA', 'Uşak Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-van', 'van', 'Van FK', 'VAN', 'Van Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-yozgat', 'yozgat', 'Yozgat FK', 'YOZ', 'Yozgat Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-zonguldak', 'zonguldak', 'Zonguldak FK', 'ZON', 'Zonguldak Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-aksaray', 'aksaray', 'Aksaray FK', 'AKS', 'Aksaray Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bayburt', 'bayburt', 'Bayburt FK', 'BAY', 'Bayburt Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-karaman', 'karaman', 'Karaman FK', 'KAR', 'Karaman Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kirikkale', 'kirikkale', 'Kırıkkale FK', 'KIR', 'Kırıkkale Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-batman', 'batman', 'Batman FK', 'BAT', 'Batman Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-sirnak', 'sirnak', 'Şırnak FK', 'ŞIR', 'Şırnak Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-bartin', 'bartin', 'Bartın FK', 'BAR', 'Bartın Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-ardahan', 'ardahan', 'Ardahan FK', 'ARD', 'Ardahan Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-igdir', 'igdir', 'Iğdır FK', 'IĞD', 'Iğdır Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-yalova', 'yalova', 'Yalova FK', 'YAL', 'Yalova Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-karabuk', 'karabuk', 'Karabük FK', 'KAR', 'Karabük Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-kilis', 'kilis', 'Kilis FK', 'KİL', 'Kilis Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-osmaniye', 'osmaniye', 'Osmaniye FK', 'OSM', 'Osmaniye Futbol Kulübü', '#3A7D44', 'light', false, null),
  ('ft-duzce', 'duzce', 'Düzce FK', 'DÜZ', 'Düzce Futbol Kulübü', '#3A7D44', 'light', false, null)

ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. RLS: oylar istemciden okunamaz; tallies/koltuklar herkese açık
-- ---------------------------------------------------------------------------
alter table public.football_clubs enable row level security;
alter table public.football_votes enable row level security;
alter table public.football_tallies enable row level security;
alter table public.football_seats enable row level security;
alter table public.football_seat_purchases enable row level security;

-- Kulüp listesi (takım adları, renkler) herkese açık.
create policy "football_clubs herkes okur" on public.football_clubs
  for select using (true);

-- Toplamlar ve koltuklar harita için herkese açık.
create policy "football_tallies herkes okur" on public.football_tallies
  for select using (true);
create policy "football_seats herkes okur" on public.football_seats
  for select using (true);

-- ---------------------------------------------------------------------------
-- 6. Oy kullanma: siyasi cast_vote ile aynı güvenlik, futbol tablolarında
-- ---------------------------------------------------------------------------
create or replace function public.football_cast_vote(p_province_id text, p_club_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_next      timestamptz;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
  v_anon      boolean := false;
  v_toplam    int := 0;
  v_gunluk    int := 0;
  v_son       timestamptz[];
  v_aralik    double precision[] := array[]::double precision[];
  v_i         int;
  v_med       double precision;
  v_sik       int := 0;
  v_gunluk_tavan int := 60;
  v_omur_tavan   int := 150;
  v_bot       boolean := false;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  select coalesce(is_bot, false) into v_bot
  from public.profiles where id = v_profile;
  if v_bot then
    return json_build_object('ok', false, 'message', 'Bu hesap bot olarak işaretlendi.');
  end if;

  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.football_clubs where id = p_club_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir kulüp yok.');
  end if;

  select next_vote_at,
         coalesce(unlimited_votes, false),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end,
         (linked_provider is null
          and (fast_votes_until is null or fast_votes_until <= now())),
         coalesce(vote_count, 0)
    into v_next, v_unlimited, v_bekleme, v_anon, v_toplam
  from public.profiles
  where id = v_profile
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  if not v_unlimited then
    select coalesce(bool_or(unlimited), false) into v_unlimited
    from public.vote_privileges where profile_id = v_profile;
    if v_unlimited then v_bekleme := interval '0'; end if;
  end if;

  if not v_unlimited and v_next is not null and v_next > now() then
    return json_build_object('ok', false, 'message', 'Oy hakkın henüz dolmadı.',
                             'next_vote_at', v_next);
  end if;

  -- Anonim tavan: günde 60, ömür 150 (siyasi haritayla aynı para birimi).
  if not v_unlimited and v_anon then
    select count(*) into v_gunluk
    from public.football_votes
    where user_id = v_profile
      and created_at > now() - interval '1 day'
      and source is distinct from 'daily';
    if v_gunluk >= v_gunluk_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Anonim hesabın bugünkü oy hakkı doldu. Yarın tekrar gel ya da profilden X/Google ile bağlan.'
      );
    end if;
    if v_toplam >= v_omur_tavan then
      return json_build_object(
        'ok', false,
        'message', 'Bu hesabın oy hakkı doldu. Profilinden X/Google ile bağlanarak devam edebilirsin.'
      );
    end if;
  end if;

  -- Ritim koruması (siyasiyle aynı): son 25 oy makine düzenindeyse reddet.
  if not v_unlimited then
    select array_agg(created_at order by created_at desc)
      into v_son
    from (
      select created_at
      from public.football_votes
      where user_id = v_profile
        and source is distinct from 'daily'
      order by created_at desc
      limit 25
    ) s;

    if v_son is not null and array_length(v_son, 1) >= 21 then
      for v_i in 1 .. array_length(v_son, 1) - 1 loop
        v_aralik := v_aralik || extract(epoch from (v_son[v_i] - v_son[v_i + 1]));
      end loop;

      select percentile_cont(0.5) within group (order by a)
        into v_med
      from unnest(v_aralik) a;

      select count(*)
        into v_sik
      from unnest(v_aralik) a
      where a between v_med - 10 and v_med + 10;

      if v_med between 45 and 90
         and v_sik::double precision / array_length(v_aralik, 1) >= 0.9 then
        update public.profiles
           set suspected_bot_at = coalesce(suspected_bot_at, now())
         where id = v_profile;
        return json_build_object(
          'ok', false,
          'message', 'Oy ritmin çok düzenli görünüyor. Bir süre ara ver ve tekrar dene.'
        );
      end if;
    end if;
  end if;

  if not public.vote_rate_ok(v_profile) then
    return json_build_object('ok', false, 'message', 'Çok hızlı oy kullanıyorsun. Biraz bekle.');
  end if;
  if not v_unlimited and not public.device_vote_budget_ok(v_profile) then
    return json_build_object('ok', false, 'message', 'Bu cihazdan çok hızlı oy kullanılıyor. Biraz bekle.');
  end if;

  insert into public.football_votes (user_id, province_id, club_id)
  values (v_profile, p_province_id, p_club_id);

  insert into public.football_tallies (province_id, club_id, votes)
  values (p_province_id, p_club_id, 1)
  on conflict (province_id, club_id)
    do update set votes = public.football_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni,
         last_seen_at = now()
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.football_cast_vote(text, text) from public;
grant execute on function public.football_cast_vote(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Kulüp başkanlığı fiyatı: boşsa $1, doluysa mevcut + $1
-- ---------------------------------------------------------------------------
create or replace function public.football_next_seat_price(p_province_id text, p_club_id text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select price + 1 from public.football_seats
      where province_id = p_province_id and club_id = p_club_id),
    1
  );
$$;

revoke all on function public.football_next_seat_price(text, text) from public;
grant execute on function public.football_next_seat_price(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Ödeme onayı: koltuğu devret (yalnızca webhook/service_role çağırır)
-- ---------------------------------------------------------------------------
create or replace function public.football_apply_seat_purchase(
  p_session_id  text,
  p_user_id     uuid,
  p_province_id text,
  p_club_id     text,
  p_amount      numeric
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required numeric;
  v_previous uuid;
begin
  if exists (select 1 from public.football_seat_purchases where stripe_session_id = p_session_id) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  select price + 1 into v_required
  from public.football_seats
  where province_id = p_province_id and club_id = p_club_id
  for update;

  v_required := coalesce(v_required, 1);

  if p_amount < v_required then
    insert into public.football_seat_purchases
      (stripe_session_id, user_id, province_id, club_id, amount_usd, status)
    values (p_session_id, p_user_id, p_province_id, p_club_id, p_amount, 'stale');
    return json_build_object('ok', false, 'message', 'Koltuk bu sırada el değiştirdi.',
                             'required', v_required);
  end if;

  select user_id into v_previous
  from public.football_seats
  where province_id = p_province_id and club_id = p_club_id;

  insert into public.football_seats
    (province_id, club_id, user_id, price, held_since, takeovers)
  values (p_province_id, p_club_id, p_user_id, p_amount, now(), 1)
  on conflict (province_id, club_id) do update
    set user_id    = excluded.user_id,
        price      = excluded.price,
        held_since = now(),
        takeovers  = public.football_seats.takeovers + 1;

  if v_previous is not null then
    update public.profiles set leader_count = greatest(0, leader_count - 1) where id = v_previous;
  end if;
  update public.profiles set leader_count = leader_count + 1 where id = p_user_id;

  insert into public.football_seat_purchases
    (stripe_session_id, user_id, province_id, club_id, amount_usd, status)
  values (p_session_id, p_user_id, p_province_id, p_club_id, p_amount, 'applied');

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.football_apply_seat_purchase(text, uuid, text, text, numeric) from public;
revoke all on function public.football_apply_seat_purchase(text, uuid, text, text, numeric) from authenticated;

-- ---------------------------------------------------------------------------
-- 9. Günlük 60 oy: yalnızca o il + kulübün başkanı, günde 1 kez
-- ---------------------------------------------------------------------------
create or replace function public.football_daily_votes(p_province_id text, p_club_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile uuid := public.current_profile_id();
  v_holder  uuid;
  v_last    timestamptz;
  v_oy      int := 60;
begin
  if v_profile is null then
    return json_build_object('ok', false, 'message', 'Hesap bulunamadı.');
  end if;

  select user_id, last_daily_at into v_holder, v_last
  from public.football_seats
  where province_id = p_province_id and club_id = p_club_id
  for update;

  if not found or v_holder is null then
    return json_build_object('ok', false, 'message', 'Bu ilde o kulübün başkanı yok.');
  end if;
  if v_holder <> v_profile then
    return json_build_object('ok', false, 'message', 'Bu ilde o kulübün başkanı sen değilsin.');
  end if;
  if v_last is not null and v_last + interval '24 hours' > now() then
    return json_build_object(
      'ok', false,
      'message', 'Bugünkü 60 oyu kullandın. Yarın tekrar gel.',
      'next_daily_at', v_last + interval '24 hours'
    );
  end if;

  insert into public.football_votes (user_id, province_id, club_id, source)
  select v_profile, p_province_id, p_club_id, 'daily'
  from generate_series(1, v_oy);

  insert into public.football_tallies (province_id, club_id, votes)
  values (p_province_id, p_club_id, v_oy)
  on conflict (province_id, club_id)
    do update set votes = public.football_tallies.votes + v_oy;

  update public.football_seats set last_daily_at = now()
  where province_id = p_province_id and club_id = p_club_id;

  return json_build_object(
    'ok', true,
    'votes', v_oy,
    'next_daily_at', now() + interval '24 hours'
  );
end;
$$;

revoke all on function public.football_daily_votes(text, text) from public;
grant execute on function public.football_daily_votes(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Kulüp kurma (kullanıcı kulüpleri) — abonelik onayı buraya yazar
-- ---------------------------------------------------------------------------
create or replace function public.apply_football_club_subscription(
  p_subscription_id text,
  p_user_id         uuid,
  p_club_id         text,
  p_name            text,
  p_short_name      text,
  p_color           text,
  p_logo_url        text,
  p_period_end      timestamptz
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_id text;
begin
  insert into public.football_clubs
    (id, province_id, name, short_name, full_name, color, on_tone, custom, owner_id, logo_url)
  values (
    p_club_id,
    '',
    p_name,
    p_short_name,
    p_name,
    p_color,
    case when p_color ~ '^#[0-9A-Fa-f]{6}$'
           and ('x' || substr(p_color, 2, 2))::bit(8)::int * 299
             + ('x' || substr(p_color, 4, 2))::bit(8)::int * 587
             + ('x' || substr(p_color, 6, 2))::bit(8)::int * 114 < 150000
         then 'light' else 'dark' end,
    true,
    p_user_id,
    p_logo_url
  )
  on conflict (id) do update
    set name = excluded.name, short_name = excluded.short_name,
        color = excluded.color, logo_url = excluded.logo_url
  returning id into v_club_id;

  return json_build_object('ok', true, 'club_id', v_club_id);
end;
$$;

revoke all on function public.apply_football_club_subscription(text, uuid, text, text, text, text, text, timestamptz) from public;
revoke all on function public.apply_football_club_subscription(text, uuid, text, text, text, text, text, timestamptz) from authenticated;

-- Doğrulama: kaç kulüp yüklendi?
select count(*) as futbol_kulubu from public.football_clubs;
