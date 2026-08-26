-- =============================================================================
-- Oy botlarına karşı savunma: anonim tavan + sabit ritim koruması + izleme
--
-- NE OLDU (canlı veri analizi, 26.08.2026)
--
-- 63 betik hesabı tüm oyların ~%47'sini atmıştı (13.094 oy). AK Parti'nin
-- oyuncu oylarının ~%60'ı (7.417 oy) bu hesaplardan geliyordu. İmza hep aynı:
--
--   - Hesap kümeleri dakikalar içinde açılıyor ("oyuncu33696, oyuncu62966,
--     oyuncu84744..." 14:00-14:04), günlerce bekliyor, sonra HEPSİ aynı anda
--     oy vermeye başlıyor.
--   - Her hesap dakikada 1 oy kullanıyor; oylar arası aralık neredeyse hiç
--     sapmıyor (medyan 62 sn, aralıkların %93'ü 50-75 sn bandında). İnsan böyle
--     oy vermez; betik zamanlayıcısı böyle oy verir.
--   - Oylar tek partiye akıyor (çoğunlukla AKP).
--
-- Mevcut savunmalar neden yetmedi: soğuma (1 dk), cihaz bütçesi (dk'da 3),
-- tavan (dk'da 30) HESAP/CIHAZ bazlı. Çiftlik her hesaba ayrı cihaz kimliği
-- verdiği için hiçbirine takılmıyor; hesap açma sınırı (imza başına günde 3)
-- parmak izi çeşitlendirilerek aşılıyor. Kısacası oyuncu başına kural, çiftlik
-- başına kural değil.
--
-- BU GÖÇ ÜÇ ŞEY YAPIYOR
--
--   1. ANONİM HESABA TAVAN. Kimliği olmayan (X/Google bağlı olmayan) hesaplar
--      günde en fazla 60, ömür boyu en fazla 150 oy kullanabilir. Normal
--      kullanıcı dakikada 1 oy kullandığında bile günde 60'a ulaşması 1 saatlik
--      kesintisiz oyun demek; o noktada "X/Google ile bağlan" uyarısı zaten
--      büyüme için istenen bir davet. Çiftlik ise her hesaptan 180 yerine en
--      fazla 150, günde 60 oy alabilir — maliyet 3-4 katına çıkar.
--   2. RİTİM KORUMASI. Son 25 oyun aralıkları makine düzenindeyse (medyan
--      45-90 sn ve aralıkların ≥%90'ı medyana ±10 sn) oy REDDEDİLİR ve hesap
--      suspected_bot_at ile işaretlenir. Betik 21. oy civarında durur; insan
--      ise (aralıklar dağınık) hiç etkilenmez. Bir kişinin kronometreyle dakika
--      dakika oy verdiği uç durumda da yalnızca "ara ver" mesajı alır — kalıcı
--      ceza yok.
--   3. ANONİM HESAP AÇMA KAPANDI. Yeni istemci zaten "önce Google" modeline
--      geçti (ensureSession oturumsuz ziyaretçiye hesap açmıyor); ama anonim
--      kayıt proje düzeyinde hâlâ açıktı ve çiftlik auth API'sine doğrudan
--      istek atarak günde onlarca anonim kullanıcı + profil yaratıyordu
--      (handle_new_user tetikleyicisi her yeni kullanıcıya otomatik profil
--      açıyor). Artık anonim kullanıcıya profil açılmıyor ve ensure_profile
--      yeni anonim profil reddediyor. Eski anonim hesaplar çalışmaya devam
--      eder (kimse hesabından edilmiyor) ama yenisi açılamaz.
--   4. GÖRÜNÜRLÜK + GİZLİLİK. suspected_vote_bots görünümü ritmi bozuk
--      hesapları elle temizlik için listeler (yalnızca service_role okur).
--      Ayrıca herkesin oy tablosunu ve cihaz imzalarını okuması kapatılıyor:
--      bu verilerle rakip botçular birbirinin ritmini görüp taklit edebiliyordu
--      (bu göçü yazarken aynı yolla tespit ettik).
--
-- SABİTLER (altını çizmek istersen):
--   v_gunluk_tavan = 60   anonim hesap için günlük oy hakkı
--   v_omur_tavan   = 150  anonim hesap için toplam oy hakkı
--   ritim: son 25 oy, medyan 45-90 sn, ±10 sn içinde ≥%90
-- =============================================================================

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 0. Ritim kontrolü her oy kullanımında son 25 oyu okuyor; dizin şart.
-- ---------------------------------------------------------------------------
create index if not exists votes_user_created_idx
  on public.votes (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 1. Şüpheli ritim damgası (yalnızca bilgi; otomatik ceza yok)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists suspected_bot_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Oy kullanma: anonim tavan + ritim koruması
-- ---------------------------------------------------------------------------
create or replace function public.cast_vote(p_province_id text, p_party_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile   uuid := public.current_profile_id();
  v_next      timestamptz;
  v_handle    text;
  v_unlimited boolean;
  v_bekleme   interval;
  v_yeni      timestamptz;
  v_kendi_partisi boolean := false;
  v_kendi_parti_saatlik_oy int := 0;
  v_anon      boolean := false;          -- kimliksiz (X/Google yok) ve ödeme yok
  v_toplam    int := 0;                  -- hesabın şimdiye kadarki oyu (vote_count)
  v_gunluk    int := 0;                  -- son 24 saatteki oy sayısı
  v_son       timestamptz[];             -- son 25 oyun zamanı (yeni → eski)
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

  -- Temizlikte is_bot işaretlenen hesap tekrar oy kullanamaz (aynı cihazdan
  -- geri giriş yapsa bile).
  select coalesce(is_bot, false) into v_bot
  from public.profiles where id = v_profile;
  if v_bot then
    return json_build_object('ok', false, 'message', 'Bu hesap bot olarak işaretlendi.');
  end if;
  if not exists (select 1 from public.provinces where id = p_province_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir il yok.');
  end if;
  if not exists (select 1 from public.parties where id = p_party_id) then
    return json_build_object('ok', false, 'message', 'Böyle bir parti yok.');
  end if;

  select exists (
    select 1
    from public.custom_parties cp
    where cp.id = p_party_id
      and cp.owner_id = v_profile
  )
  into v_kendi_partisi;

  if v_kendi_partisi then
    select count(*)
      into v_kendi_parti_saatlik_oy
    from public.votes v
    where v.user_id = v_profile
      and v.party_id = p_party_id
      and v.created_at > now() - interval '1 hour'
      and v.source is distinct from 'rally';

    if v_kendi_parti_saatlik_oy >= 10 then
      return json_build_object(
        'ok', false,
        'message', 'Sen zaten parti kurucususun; kendi partine 1 saatte en fazla 10 oy verebilirsin.'
      );
    end if;
  end if;

  -- Aynı anda gelen iki isteğin ikisinin de geçmesini engellemek için satır
  -- kilidi. Bekleme süresi kilitli satırdan tek okumada geliyor.
  select next_vote_at,
         handle,
         coalesce(unlimited_votes, false),
         coalesce(vote_count, 0),
         case
           when coalesce(unlimited_votes, false) then interval '0'
           when fast_votes_until is not null and fast_votes_until > now()
             then interval '15 seconds'
           else interval '1 minute'
         end,
         -- Anonim: kimlik bağı yok VE aktif hızlı oy ödemesi yok.
         (linked_provider is null
          and (fast_votes_until is null or fast_votes_until <= now()))
    into v_next, v_handle, v_unlimited, v_toplam, v_bekleme, v_anon
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

  /*
   * ANONİM TAVAN — kimliksiz hesaplar çiftlik para birimi.
   *
   * Günlük tavan çiftliğin günlük verimini, ömür tavanı hesap başına verimi
   * keser. Kimliğini bağlayan (X/Google) ya da hızlı oy ödeyen hesap
   * dokunulmaz: bağlamak zaten oyunun istediği davranış.
   */
  if not v_unlimited and v_anon then
    select count(*)
      into v_gunluk
    from public.votes
    where user_id = v_profile
      and created_at > now() - interval '1 day'
      and source is distinct from 'rally';

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

  /*
   * RİTİM KORUMASI — makine düzeninde oy atan hesabı durdur.
   *
   * Son 25 oyun aralıklarına bakar: medyan 45-90 sn (dakikada 1 oy ritmi) ve
   * aralıkların ≥%90'ı medyana ±10 sn içindeyse oy reddedilir. İnsan aralıkları
   * dağınıktır; betik zamanlayıcısı milimetrik. Reddedilen hesap yalnızca
   * damgalanır (suspected_bot_at) — kalıcı ceza yok, elle temizlik görünürlük
   * görünümünden yapılır.
   */
  if not v_unlimited then
    select array_agg(created_at order by created_at desc)
      into v_son
    from (
      select created_at
      from public.votes
      where user_id = v_profile
        and source is distinct from 'rally'
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
    return json_build_object(
      'ok', false,
      'message', 'Çok hızlı oy kullanıyorsun. Biraz bekle.'
    );
  end if;

  -- Cihaz bütçesi: sınırsız hakkı olan muaf, çünkü tavan onu zaten tutuyor.
  if not v_unlimited and not public.device_vote_budget_ok(v_profile) then
    return json_build_object(
      'ok', false,
      'message', 'Bu cihazdan çok hızlı oy kullanılıyor. Biraz bekle.'
    );
  end if;

  insert into public.votes (user_id, province_id, party_id)
  values (v_profile, p_province_id, p_party_id);

  insert into public.province_tallies (province_id, party_id, votes)
  values (p_province_id, p_party_id, 1)
  on conflict (province_id, party_id)
    do update set votes = public.province_tallies.votes + 1;

  v_yeni := case when v_unlimited then null else now() + v_bekleme end;

  update public.profiles
     set xp           = xp + 1,
         vote_count   = vote_count + 1,
         next_vote_at = v_yeni,
         last_seen_at = now(),
         trusted_at   = case
                          when trusted_at is null
                               and public.profile_trusted(vote_count + 1, leader_count)
                          then now() else trusted_at
                        end
   where id = v_profile;

  return json_build_object('ok', true, 'next_vote_at', v_yeni);
end;
$$;

revoke all on function public.cast_vote(text, text) from public;
grant execute on function public.cast_vote(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2b. Yeni anonim hesap açmayı kapat
-- ---------------------------------------------------------------------------

/*
 * Kapı 1 — auth tetikleyicisi: yeni anonim kullanıcıya artık profil açılmıyor.
 *
 * Çiftlik auth API'sine doğrudan `POST /auth/v1/signup` atıyor; her yeni anonim
 * kullanıcı bu tetikleyiciyle otomatik profil sahibi oluyordu. Anonim kaydı
 * atla — Google/X ile gelen kullanıcılar eskisi gibi profil sahibi olur.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (auth_user_id, handle, display_name, avatar_url)
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
  on conflict (auth_user_id) do update
    set handle       = excluded.handle,
        display_name = excluded.display_name,
        avatar_url   = excluded.avatar_url;
  return new;
end;
$$;

/*
 * Tetikleyiciyi geri bağla.
 *
 * 20260823170000 göçü bu tetikleyiciyi kaldırmıştı (profil açma ensure_profile'e
 * taşınmıştı). Şimdi anonim kaydı kapatmak için tetikleyiciye YENİDEN ihtiyaç
 * var: çiftlik auth API'sine doğrudan signup atıyor ve ensure_profile'i hiç
 * çağırmadan profil sahibi oluyordu. Tetikleyici yeni anonim kullanıcıya profil
 * açmaz; Google/X ile gelen kullanıcılar eskisi gibi profil sahibi olur.
 *
 * NOT: 20260823170000'den beri profiles.id, auth.users.id DEĞİL — ayrı bir
 * kimlik, bağlantı auth_user_id sütunundan yapılıyor. Bu yüzden tetikleyici
 * id yerine auth_user_id yazar; yoksa hem tetikleyici hem ensure_profile ayrı
 * satır açardı.
 */
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/*
 * Kapı 2 — ensure_profile: yeni anonim profil isteği reddedilir.
 *
 * Tetikleyici kaldırılırsa (platform müdahalesi) ya da tetikleyiciden önce
 * ulaşan bir yol bulunursa ikinci kapı devrede. Eski anonim hesaplar
 * 'oturum'/'cihaz' yolundan gelmeye devam eder; yalnızca GERÇEKTEN yeni
 * anonim profil reddedilir.
 */
create or replace function public.ensure_profile(p_device_id text, p_device_hash text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth       uuid := auth.uid();
  v_saglayici  text := coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', 'anonymous');
  v_eposta     text := nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  v_konu       text;
  v_profile    uuid;
  v_recent     int;
  v_handle     text;
  v_attempts   int := 0;
  v_yol        text;
  v_cihaz_bos  boolean;
begin
  if v_auth is null then
    return json_build_object('ok', false, 'message', 'Oturum yok.');
  end if;
  if p_device_id is null or char_length(p_device_id) < 8 then
    return json_build_object('ok', false, 'message', 'Cihaz kimliği geçersiz.');
  end if;

  if v_saglayici <> 'anonymous' and v_eposta is not null then
    v_konu := encode(sha256(convert_to(v_eposta, 'UTF8')), 'hex');
  end if;

  -- 1) Bu oturumun profili
  select id into v_profile from public.profiles where auth_user_id = v_auth;
  if v_profile is not null then
    v_yol := 'oturum';
  end if;

  -- 2) Bu kimliğin profili (başka cihaz, aynı Google hesabı)
  if v_profile is null and v_konu is not null then
    select profile_id into v_profile
    from public.profile_identities
    where provider = v_saglayici and subject = v_konu;
    if v_profile is not null then
      update public.profiles set auth_user_id = v_auth where id = v_profile;
      v_yol := 'kimlik';
    end if;
  end if;

  -- 3) Bu cihazın profili. Cihazdaki hesap başka bir kimliğe bağlıysa
  --    dokunulmuyor: paylaşılan bilgisayarda ikinci kişi birincinin hesabını
  --    devralmasın.
  if v_profile is null then
    select id into v_profile from public.profiles where device_id = p_device_id;

    if v_profile is not null
       and v_konu is not null
       and exists (select 1 from public.profile_identities where profile_id = v_profile)
    then
      v_profile := null;
    elsif v_profile is not null then
      update public.profiles set auth_user_id = v_auth where id = v_profile;
      v_yol := 'cihaz';
    end if;
  end if;

  -- 4) Yeni hesap — yalnızca kimlikli (X/Google). Anonim kayıt kapalı.
  if v_profile is null then
    if v_saglayici = 'anonymous' then
      return json_build_object(
        'ok', false,
        'message', 'Kayıt artık Google ile yapılıyor. "Google ile giriş" yaparak devam et.'
      );
    end if;

    -- Sayaç KAYIT imzasına bakıyor: giriş imzası her seferinde güncellendiği
    -- için onunla sayınca, hesapları farklı cihazlarda açan biri sayacı
    -- sıfırlayabiliyordu.
    select count(*) into v_recent
    from public.profiles
    where signup_device_hash = p_device_hash
      and created_at > now() - interval '24 hours';

    -- Sınır artık Google ile girenler için de geçerli: buraya yalnızca
    -- GERÇEKTEN yeni bir hesap açılırken geliniyor.
    if v_recent >= 3 then
      return json_build_object(
        'ok', false,
        'message', 'Bu cihazdan bugün çok fazla hesap açıldı. Yarın tekrar dene ya da mevcut hesabınla giriş yap.'
      );
    end if;

    loop
      v_handle := 'oyuncu' || lpad((floor(random() * 100000))::int::text, 5, '0');
      exit when not exists (select 1 from public.profiles where lower(handle) = lower(v_handle));
      v_attempts := v_attempts + 1;
      if v_attempts > 20 then
        v_handle := 'oyuncu' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
        exit;
      end if;
    end loop;

    -- device_id benzersiz: başkasındaysa bu hesaba yazılmıyor.
    select not exists (select 1 from public.profiles where device_id = p_device_id)
      into v_cihaz_bos;

    insert into public.profiles
      (auth_user_id, handle, display_name, device_id, device_hash, signup_device_hash)
    values (v_auth, v_handle, v_handle,
            case when v_cihaz_bos then p_device_id else null end,
            p_device_hash, p_device_hash)
    returning id into v_profile;
    v_yol := 'yeni';
  end if;

  update public.profiles
     set device_id = case
           when exists (
             select 1 from public.profiles o
             where o.device_id = p_device_id and o.id <> v_profile
           ) then device_id
           else p_device_id
         end,
         device_hash     = coalesce(p_device_hash, device_hash),
         linked_provider = case when v_konu is not null then v_saglayici else linked_provider end,
         last_seen_at    = now()
   where id = v_profile;

  if v_konu is not null then
    insert into public.profile_identities (provider, subject, profile_id)
    values (v_saglayici, v_konu, v_profile)
    on conflict (provider, subject) do nothing;
  end if;

  return json_build_object('ok', true, 'profile_id', v_profile, 'yol', v_yol);
end;
$$;

revoke all on function public.ensure_profile(text, text) from public;
grant execute on function public.ensure_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Şüpheli ritim görünümü — elle temizlik için (yalnızca service_role)
-- ---------------------------------------------------------------------------

/*
 * Bir hesap şu durumlarda listeye girer:
 *   - medyan aralık 50-75 sn ve aralıkların ≥%80'i bu bandın içinde (dakikada
 *     1 oy ritmi), YA DA
 *   - medyan ≤35 sn ve aralıkların ≥%60'ı 10-32 sn bandında (hızlı oy ritmi),
 *   - en az 30 oy.
 * Eşikler bilerek çift haneli değil: liste ceza değil, göz kararı listesidir.
 */
create or replace view public.suspected_vote_bots
with (security_invoker = false) as
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
         count(sn)                                     as aralik,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric
               / nullif(count(sn), 0), 3)              as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric
               / nullif(count(sn), 0), 3)              as band20,
         min(created_at)                                as ilk_oy,
         max(created_at)                                as son_oy
  from araliklar
  group by user_id
)
select p.handle,
       p.linked_provider,
       (p.fast_votes_until is not null and p.fast_votes_until > now()) as hizli_odeme_var,
       s.oy,
       round(s.medyan::numeric, 0) as medyan_sn,
       s.band60,
       s.band20,
       to_char(p.created_at, 'DD.MM HH24:MI') as hesap_acilis,
       to_char(s.ilk_oy, 'DD.MM HH24:MI')     as ilk_oy,
       to_char(s.son_oy, 'DD.MM HH24:MI')     as son_oy
from istatistik s
join public.profiles p on p.id = s.user_id
where not coalesce(p.is_bot, false)
  and s.oy >= 30
  and ((s.medyan between 50 and 75 and s.band60 >= 0.8)
       or (s.medyan <= 35 and s.band20 >= 0.6))
order by s.oy desc;

revoke all on public.suspected_vote_bots from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Gizlilik: oy tablosu ve cihaz imzaları artık istemciden okunamıyor
-- ---------------------------------------------------------------------------

/*
 * public.votes'i yalnızca sunucu fonksiyonları yazar/okur; istemci geçmişi
 * vote_history RPC'sinden (security definer) alıyor. Doğrudan okumayı kapatmak
 * botçuların birbirinin ritmini görüp taklit etmesini engeller ve her oyuncunun
 * kime ne zaman oy verdiğini herkese açık olmaktan çıkarır.
 */
revoke select on public.votes from anon, authenticated;

/*
 * recent_votes canlı akış görünümü SAHİBİ adına çalışsın.
 *
 * Bu görünüm security_invoker = true idi: oy tablosundan SELECT'i kaldırınca
 * istemcinin "canlı akış" ve il panelindeki "son oylar" bölümü permission
 * denied ile kırılırdı. Görünümü sahibi adına çalışacak şekilde yeniden
 * kuruyoruz: ham tablo istemciye kapalı kalır, ama oyunun kasıtlı kamu
 * özelliği olan son oylar akışı çalışmaya devam eder. Görünüm user_id
 * taşımadığı için ritim verisi bu yoldan hesap düzeyinde toplanamaz.
 *
 * limit 100 bilerek: akış özelliğidir, geçmiş dökümü değil. İstemci 12-14
 * satır çekiyor; sınır yalnızca "tüm geçmişi tek sorguda indir" yolunu kapatır.
 *
 * NOT: create or replace view ile security_invoker DEĞİŞTİRİLEMİYOR
 * ("cannot change security_invoker option of a view"). Görünüm zaten
 * security_invoker = true ile kurulu olduğundan önce düşürüp yeniden
 * kuruyoruz; istemci dışında başka bir SQL nesnesi bu görünüme bağlı değil.
 */
drop view if exists public.recent_votes;

create view public.recent_votes
with (security_invoker = false) as
  select distinct on (v.created_at, v.user_id, v.province_id, v.party_id, v.source)
         v.province_id, v.party_id, v.created_at, p.handle, v.source
  from public.votes v
  join public.profiles p on p.id = v.user_id
  order by v.created_at desc, v.user_id, v.province_id, v.party_id, v.source
  limit 100;

grant select on public.recent_votes to anon, authenticated;

/*
 * Cihaz imzaları kimlik sayılır. Bu göçü yazarken tüm bot çiftliğini bu
 * sütunlardan çıkardık; aynı veriyi siteyi açan HERKES okuyabiliyordu.
 * Yalnızca service_role (panel / SQL Editor) görsün. İstemcinin okuduğu
 * sütunlara dokunulmuyor (bkz. supabaseBackend.profilAlanlari).
 */
revoke select (device_id, device_hash, signup_device_hash, recovery_hash,
               stripe_customer_id, fast_votes_subscription_id)
  on public.profiles from anon, authenticated;
