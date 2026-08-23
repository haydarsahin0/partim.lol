-- =============================================================================
-- partim.lol — Supabase şeması
--
-- Kurulum:
--   supabase db push          (veya bu dosyayı SQL Editor'a yapıştır)
--
-- Tasarım ilkesi: istemciye güvenilmez. Oy soğuma süresi, XP ve koltuk fiyatı
-- burada, SECURITY DEFINER fonksiyonların içinde doğrulanır. Tablolara doğrudan
-- yazma yetkisi hiçbir kullanıcıya verilmez.
--
-- Oyun sabitleri (src/lib/game.ts ile birebir aynı olmalı):
--   oy soğuma süresi        1 saat
--   oy başına XP            1
--   başkanlık saat başı XP  20
--   koltuk açılış fiyatı    $1, her devralmada +$1
-- =============================================================================

-- ------------------------------ referans veri --------------------------------

create table if not exists public.provinces (
  id     text primary key,
  plate  int  not null unique,
  name   text not null,
  region text not null
);

create table if not exists public.parties (
  id        text primary key,
  name      text not null,
  full_name text not null,
  color     text not null
);

insert into public.provinces (id, plate, name, region) values
  ('adana', 1, 'Adana', 'Akdeniz'),
  ('adiyaman', 2, 'Adıyaman', 'Güneydoğu Anadolu'),
  ('afyonkarahisar', 3, 'Afyonkarahisar', 'Ege'),
  ('agri', 4, 'Ağrı', 'Doğu Anadolu'),
  ('amasya', 5, 'Amasya', 'Karadeniz'),
  ('ankara', 6, 'Ankara', 'İç Anadolu'),
  ('antalya', 7, 'Antalya', 'Akdeniz'),
  ('artvin', 8, 'Artvin', 'Karadeniz'),
  ('aydin', 9, 'Aydın', 'Ege'),
  ('balikesir', 10, 'Balıkesir', 'Marmara'),
  ('bilecik', 11, 'Bilecik', 'Marmara'),
  ('bingol', 12, 'Bingöl', 'Doğu Anadolu'),
  ('bitlis', 13, 'Bitlis', 'Doğu Anadolu'),
  ('bolu', 14, 'Bolu', 'Karadeniz'),
  ('burdur', 15, 'Burdur', 'Akdeniz'),
  ('bursa', 16, 'Bursa', 'Marmara'),
  ('canakkale', 17, 'Çanakkale', 'Marmara'),
  ('cankiri', 18, 'Çankırı', 'İç Anadolu'),
  ('corum', 19, 'Çorum', 'Karadeniz'),
  ('denizli', 20, 'Denizli', 'Ege'),
  ('diyarbakir', 21, 'Diyarbakır', 'Güneydoğu Anadolu'),
  ('edirne', 22, 'Edirne', 'Marmara'),
  ('elazig', 23, 'Elazığ', 'Doğu Anadolu'),
  ('erzincan', 24, 'Erzincan', 'Doğu Anadolu'),
  ('erzurum', 25, 'Erzurum', 'Doğu Anadolu'),
  ('eskisehir', 26, 'Eskişehir', 'İç Anadolu'),
  ('gaziantep', 27, 'Gaziantep', 'Güneydoğu Anadolu'),
  ('giresun', 28, 'Giresun', 'Karadeniz'),
  ('gumushane', 29, 'Gümüşhane', 'Karadeniz'),
  ('hakkari', 30, 'Hakkâri', 'Doğu Anadolu'),
  ('hatay', 31, 'Hatay', 'Akdeniz'),
  ('isparta', 32, 'Isparta', 'Akdeniz'),
  ('mersin', 33, 'Mersin', 'Akdeniz'),
  ('istanbul', 34, 'İstanbul', 'Marmara'),
  ('izmir', 35, 'İzmir', 'Ege'),
  ('kars', 36, 'Kars', 'Doğu Anadolu'),
  ('kastamonu', 37, 'Kastamonu', 'Karadeniz'),
  ('kayseri', 38, 'Kayseri', 'İç Anadolu'),
  ('kirklareli', 39, 'Kırklareli', 'Marmara'),
  ('kirsehir', 40, 'Kırşehir', 'İç Anadolu'),
  ('kocaeli', 41, 'Kocaeli', 'Marmara'),
  ('konya', 42, 'Konya', 'İç Anadolu'),
  ('kutahya', 43, 'Kütahya', 'Ege'),
  ('malatya', 44, 'Malatya', 'Doğu Anadolu'),
  ('manisa', 45, 'Manisa', 'Ege'),
  ('kahramanmaras', 46, 'Kahramanmaraş', 'Akdeniz'),
  ('mardin', 47, 'Mardin', 'Güneydoğu Anadolu'),
  ('mugla', 48, 'Muğla', 'Ege'),
  ('mus', 49, 'Muş', 'Doğu Anadolu'),
  ('nevsehir', 50, 'Nevşehir', 'İç Anadolu'),
  ('nigde', 51, 'Niğde', 'İç Anadolu'),
  ('ordu', 52, 'Ordu', 'Karadeniz'),
  ('rize', 53, 'Rize', 'Karadeniz'),
  ('sakarya', 54, 'Sakarya', 'Marmara'),
  ('samsun', 55, 'Samsun', 'Karadeniz'),
  ('siirt', 56, 'Siirt', 'Güneydoğu Anadolu'),
  ('sinop', 57, 'Sinop', 'Karadeniz'),
  ('sivas', 58, 'Sivas', 'İç Anadolu'),
  ('tekirdag', 59, 'Tekirdağ', 'Marmara'),
  ('tokat', 60, 'Tokat', 'Karadeniz'),
  ('trabzon', 61, 'Trabzon', 'Karadeniz'),
  ('tunceli', 62, 'Tunceli', 'Doğu Anadolu'),
  ('sanliurfa', 63, 'Şanlıurfa', 'Güneydoğu Anadolu'),
  ('usak', 64, 'Uşak', 'Ege'),
  ('van', 65, 'Van', 'Doğu Anadolu'),
  ('yozgat', 66, 'Yozgat', 'İç Anadolu'),
  ('zonguldak', 67, 'Zonguldak', 'Karadeniz'),
  ('aksaray', 68, 'Aksaray', 'İç Anadolu'),
  ('bayburt', 69, 'Bayburt', 'Karadeniz'),
  ('karaman', 70, 'Karaman', 'İç Anadolu'),
  ('kirikkale', 71, 'Kırıkkale', 'İç Anadolu'),
  ('batman', 72, 'Batman', 'Güneydoğu Anadolu'),
  ('sirnak', 73, 'Şırnak', 'Güneydoğu Anadolu'),
  ('bartin', 74, 'Bartın', 'Karadeniz'),
  ('ardahan', 75, 'Ardahan', 'Doğu Anadolu'),
  ('igdir', 76, 'Iğdır', 'Doğu Anadolu'),
  ('yalova', 77, 'Yalova', 'Marmara'),
  ('karabuk', 78, 'Karabük', 'Karadeniz'),
  ('kilis', 79, 'Kilis', 'Güneydoğu Anadolu'),
  ('osmaniye', 80, 'Osmaniye', 'Akdeniz'),
  ('duzce', 81, 'Düzce', 'Karadeniz')
on conflict (id) do update
  set plate = excluded.plate, name = excluded.name, region = excluded.region;

insert into public.parties (id, name, full_name, color) values
  ('akp', 'AK Parti', 'Adalet ve Kalkınma Partisi', '#F58220'),
  ('chp', 'CHP', 'Cumhuriyet Halk Partisi', '#E30A17'),
  ('dem', 'DEM Parti', 'Halkların Eşitlik ve Demokrasi Partisi', '#7B2D8E'),
  ('mhp', 'MHP', 'Milliyetçi Hareket Partisi', '#8E1B2E'),
  ('iyi', 'İYİ Parti', 'İYİ Parti', '#00A0DF'),
  ('yrp', 'Yeniden Refah', 'Yeniden Refah Partisi', '#0F6B4A'),
  ('zafer', 'Zafer Partisi', 'Zafer Partisi', '#1B3A93'),
  ('tip', 'TİP', 'Türkiye İşçi Partisi', '#D81E05'),
  ('sp', 'Saadet', 'Saadet Partisi', '#16326B'),
  ('deva', 'DEVA', 'Demokrasi ve Atılım Partisi', '#00A8A0'),
  ('gelecek', 'Gelecek', 'Gelecek Partisi', '#3F51B5'),
  ('dp', 'Demokrat Parti', 'Demokrat Parti', '#0057A8'),
  ('hudapar', 'HÜDA PAR', 'Hür Dava Partisi', '#3E8E41'),
  ('bbp', 'BBP', 'Büyük Birlik Partisi', '#1F2E5C'),
  ('memleket', 'Memleket', 'Memleket Partisi', '#C2185B')
on conflict (id) do update
  set name = excluded.name, full_name = excluded.full_name, color = excluded.color;

-- -------------------------------- profiller ----------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  handle       text not null,
  display_name text not null default '',
  avatar_url   text,
  xp           bigint not null default 0 check (xp >= 0),
  vote_count   int    not null default 0 check (vote_count >= 0),
  leader_count int    not null default 0 check (leader_count >= 0),
  next_vote_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists profiles_xp_idx on public.profiles (xp desc);

-- X (Twitter) OAuth'tan gelen kullanıcı için profili otomatik aç.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, handle, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'user_name',
      new.raw_user_meta_data ->> 'preferred_username',
      new.raw_user_meta_data ->> 'screen_name',
      left(new.id::text, 8)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'user_name',
      ''
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set handle       = excluded.handle,
        display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------- oylar ------------------------------------

create table if not exists public.votes (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  province_id text not null references public.provinces (id),
  party_id    text not null references public.parties (id),
  created_at  timestamptz not null default now()
);

create index if not exists votes_province_created_idx
  on public.votes (province_id, created_at desc);
create index if not exists votes_user_idx on public.votes (user_id, created_at desc);

-- Toplam tablo: her oyda artırılır, harita bunu okur.
create table if not exists public.province_tallies (
  province_id text not null references public.provinces (id),
  party_id    text not null references public.parties (id),
  votes       int  not null default 0 check (votes >= 0),
  primary key (province_id, party_id)
);

-- --------------------------- il başkanlığı koltukları ------------------------

create table if not exists public.leader_seats (
  province_id   text not null references public.provinces (id),
  party_id      text not null references public.parties (id),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  price         numeric(10, 2) not null check (price > 0),
  held_since    timestamptz not null default now(),
  takeovers     int not null default 1,
  -- Saatlik XP'nin hangi ana kadar ödendiği; mükerrer ödemeyi engeller.
  xp_paid_until timestamptz not null default now(),
  primary key (province_id, party_id)
);

create index if not exists leader_seats_user_idx on public.leader_seats (user_id);

-- Stripe ödemeleri; webhook'un tekrar tekrar gelmesine karşı kayıt defteri.
create table if not exists public.seat_purchases (
  id                bigserial primary key,
  stripe_session_id text unique not null,
  user_id           uuid not null references public.profiles (id) on delete cascade,
  province_id       text not null references public.provinces (id),
  party_id          text not null references public.parties (id),
  amount_usd        numeric(10, 2) not null,
  -- applied: koltuk devredildi | stale: ödeme sırasında fiyat arttı, iade gerekir
  status            text not null default 'applied',
  created_at        timestamptz not null default now()
);

-- ------------------------------ okuma görünümleri ----------------------------

create or replace view public.recent_votes
with (security_invoker = true) as
  select v.province_id, v.party_id, v.created_at, p.handle
  from public.votes v
  join public.profiles p on p.id = v.user_id
  order by v.created_at desc;

-- --------------------------------- kurallar ----------------------------------

-- Boş bir koltuk $1; dolu koltuk mevcut bedelin $1 fazlasına devralınır.
create or replace function public.next_seat_price(p_province_id text, p_party_id text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select price + 1 from public.leader_seats
      where province_id = p_province_id and party_id = p_party_id),
    1
  );
$$;

-- Oy kullan: saatte bir, +1 XP. İstemci bu fonksiyonu çağırır.
create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_next    timestamptz;
begin
  if v_user_id is null then
    return json_build_object('ok', false, 'message', 'Önce giriş yapmalısın.');
  end if;

  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;

  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır kilidi.
  select next_vote_at into v_next
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    return json_build_object('ok', false, 'message', 'Profil bulunamadı.');
  end if;

  if v_next is not null and v_next > now() then
    return json_build_object(
      'ok', false,
      'message', 'Oy hakkın henüz dolmadı.',
      'next_vote_at', v_next
    );
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_user_id, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = now() + interval '1 hour'
   where id = v_user_id;

  return json_build_object('ok', true, 'next_vote_at', now() + interval '1 hour');
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- Ödeme onaylandıktan sonra koltuğu devret. Yalnızca webhook (service_role) çağırır.
create or replace function public.apply_seat_purchase(
  p_session_id  text,
  p_user_id     uuid,
  p_province_id text,
  p_party_id    text,
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
  -- Webhook birden çok kez gelebilir; aynı oturum ikinci kez işlenmez.
  if exists (select 1 from public.seat_purchases where stripe_session_id = p_session_id) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  select price + 1 into v_required
  from public.leader_seats
  where province_id = p_province_id and party_id = p_party_id
  for update;

  v_required := coalesce(v_required, 1);

  -- Ödeme yapılırken başkası devraldıysa tutar yetmez: kayda geç, iade operatöre kalır.
  if p_amount < v_required then
    insert into public.seat_purchases
      (stripe_session_id, user_id, province_id, party_id, amount_usd, status)
    values (p_session_id, p_user_id, p_province_id, p_party_id, p_amount, 'stale');
    return json_build_object('ok', false, 'message', 'Koltuk bu sırada el değiştirdi.',
                             'required', v_required);
  end if;

  select user_id into v_previous
  from public.leader_seats
  where province_id = p_province_id and party_id = p_party_id;

  insert into public.leader_seats
    (province_id, party_id, user_id, price, held_since, takeovers, xp_paid_until)
  values (p_province_id, p_party_id, p_user_id, p_amount, now(), 1, now())
  on conflict (province_id, party_id) do update
    set user_id       = excluded.user_id,
        price         = excluded.price,
        held_since    = now(),
        takeovers     = public.leader_seats.takeovers + 1,
        xp_paid_until = now();

  if v_previous is not null then
    update public.profiles set leader_count = greatest(0, leader_count - 1) where id = v_previous;
  end if;
  update public.profiles set leader_count = leader_count + 1 where id = p_user_id;

  insert into public.seat_purchases
    (stripe_session_id, user_id, province_id, party_id, amount_usd, status)
  values (p_session_id, p_user_id, p_province_id, p_party_id, p_amount, 'applied');

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.apply_seat_purchase(text, uuid, text, text, numeric) from public;
revoke all on function public.apply_seat_purchase(text, uuid, text, text, numeric) from authenticated;

-- Saatlik başkanlık XP'si. Tam saatler işlenir, artan dakika bir sonraki tura kalır.
create or replace function public.accrue_leader_xp()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  with due as (
    select province_id, party_id, user_id,
           floor(extract(epoch from (now() - xp_paid_until)) / 3600)::int as hours
    from public.leader_seats
    where xp_paid_until <= now() - interval '1 hour'
  ),
  paid as (
    update public.leader_seats s
       set xp_paid_until = s.xp_paid_until + (d.hours * interval '1 hour')
      from due d
     where s.province_id = d.province_id and s.party_id = d.party_id
     returning d.user_id, d.hours
  ),
  totals as (
    select user_id, sum(hours) * 20 as gained
    from paid
    group by user_id
  )
  update public.profiles p
     set xp = p.xp + t.gained
    from totals t
   where p.id = t.user_id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.accrue_leader_xp() from public;
revoke all on function public.accrue_leader_xp() from authenticated;

-- Saat başı çalıştır (pg_cron eklentisi Dashboard > Database > Extensions'tan açılır):
--   select cron.schedule('partim-leader-xp', '0 * * * *', $$select public.accrue_leader_xp()$$);

-- ----------------------------------- RLS -------------------------------------

alter table public.provinces        enable row level security;
alter table public.parties          enable row level security;
alter table public.profiles         enable row level security;
alter table public.votes            enable row level security;
alter table public.province_tallies enable row level security;
alter table public.leader_seats     enable row level security;
alter table public.seat_purchases   enable row level security;

-- Herkese açık okuma: harita, sonuçlar, koltuklar ve sıralama giriş yapmadan da görünür.
drop policy if exists "herkes okur" on public.provinces;
create policy "herkes okur" on public.provinces for select using (true);

drop policy if exists "herkes okur" on public.parties;
create policy "herkes okur" on public.parties for select using (true);

drop policy if exists "herkes okur" on public.profiles;
create policy "herkes okur" on public.profiles for select using (true);

drop policy if exists "herkes okur" on public.province_tallies;
create policy "herkes okur" on public.province_tallies for select using (true);

drop policy if exists "herkes okur" on public.leader_seats;
create policy "herkes okur" on public.leader_seats for select using (true);

drop policy if exists "herkes okur" on public.votes;
create policy "herkes okur" on public.votes for select using (true);

-- Kendi ödeme kayıtlarını görebilir.
drop policy if exists "kendi odemeleri" on public.seat_purchases;
create policy "kendi odemeleri" on public.seat_purchases
  for select using (auth.uid() = user_id);

-- Yazma politikası bilerek yok: tüm değişiklikler yukarıdaki fonksiyonlardan geçer.
