-- "Çevrimiçi" sayacı gerçekten sitede olanı saysın.
--
-- İKİ AYRI SEBEPTEN EKSİK SAYIYORDU
--
-- 1. touch_presence ÖLÜ KODDU. Fonksiyon `where id = auth.uid()` diyor; oysa
--    cihaz hesapları göçünden (20260823170000) beri profiles.id ayrı bir uuid
--    ve oturum kimliği auth_user_id sütununda duruyor. Yani koşul hiçbir satırı
--    tutmuyordu: istemci sayacı düzenli olarak çağırıyor ama hiçbir şey
--    güncellenmiyordu. last_seen_at yalnızca OY KULLANILINCA ya da girişte
--    yazıldığı için "çevrimiçi", "sitede olan" değil "son 5 dakikada oy kullanan"
--    demekti. Haritaya bakan, sıralamayı gezen herkes sayılmıyordu.
--
-- 2. GİRİŞ YAPMAYANIN PROFİLİ YOK. Sayaç profiles tablosunu sayıyor; oysa
--    Twitter'dan gelip haritaya bakan yüzlerce kişinin hesabı yok. Hiçbir
--    koşulla sayılamıyorlardı.
--
-- Çözüm: varlığı profilden ayır. Herkes — girsin girmesin — tarayıcı kimliğiyle
-- hafif bir satıra dokunuyor, sayaç onu sayıyor.

-- ---------------------------------------------------------------------------
-- 1. touch_presence'ı canlandır
-- ---------------------------------------------------------------------------

create or replace function public.touch_presence()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set last_seen_at = now()
   where id = public.current_profile_id();
$$;

revoke all on function public.touch_presence() from public;
grant execute on function public.touch_presence() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ziyaretçi varlığı
-- ---------------------------------------------------------------------------

/*
 * Giriş yapmamış ziyaretçinin varlığı.
 *
 * Tek tuttuğumuz şey tarayıcının kendi rastgele kimliği ve son görülme anı —
 * ad yok, e-posta yok, IP yok. Kimlik zaten o tarayıcıda duruyor; buradaki
 * kopya yalnızca "kaç ayrı tarayıcı açık" sorusunu cevaplıyor.
 *
 * İstemciye KAPALI: satırları kimse okuyamıyor, yalnızca sayı görünüyor
 * (bkz. online_count). Aksi hâlde herkes kimlik listesini çekebilirdi.
 */
create table if not exists public.visitor_presence (
  device_id     text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists visitor_presence_son_idx
  on public.visitor_presence (last_seen_at desc);

alter table public.visitor_presence enable row level security;
-- Politika yok = istemci hiçbir satırı okuyamaz/yazamaz. Erişim yalnızca
-- aşağıdaki security definer fonksiyonlardan.

/*
 * Ziyaretçiyi işaretle. Girişi olmayan da çağırabiliyor (anon).
 *
 * Temizlik burada, düşük olasılıkla: ayrı bir zamanlanmış işe bağlamak
 * kurulumda bir adım daha demek ve o adım atlanınca tablo sessizce büyür.
 * Yüzde birlik ihtimalle iki günden eski satırlar siliniyor; trafiğin olduğu
 * yerde bu fazlasıyla sık çalışıyor.
 */
create or replace function public.touch_visitor(p_device_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device_id is null or char_length(p_device_id) < 8 then
    return;
  end if;

  insert into public.visitor_presence (device_id)
  values (p_device_id)
  on conflict (device_id) do update set last_seen_at = now();

  if random() < 0.01 then
    delete from public.visitor_presence where last_seen_at < now() - interval '2 days';
  end if;
end;
$$;

revoke all on function public.touch_visitor(text) from public;
grant execute on function public.touch_visitor(text) to anon, authenticated;

/*
 * Çevrimiçi sayısı.
 *
 * Ayrı bir fonksiyon çünkü site_stats görünümü çağıranın yetkisiyle çalışıyor
 * (security_invoker) ve visitor_presence istemciye kapalı. Fonksiyon definer
 * olduğu için satırları o okuyor, dışarıya yalnızca sayı çıkıyor.
 */
-- Dönüş tipi değişirse `create or replace` düşer; önce düşürüyoruz ki göç
-- tekrar çalıştırıldığında da temiz geçsin.
drop function if exists public.online_count();

create function public.online_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  /*
   * bigint, int değil.
   *
   * Görünümdeki `online` sütunu şu an count(*)'tan geliyor, yani bigint.
   * `create or replace view` sütun tipini değiştiremiyor: int dönseydi göç
   * "cannot change data type of view column" ile düşerdi.
   */
  select count(*)
  from public.visitor_presence
  where last_seen_at > now() - interval '5 minutes';
$$;

revoke all on function public.online_count() from public;
grant execute on function public.online_count() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sayaç
-- ---------------------------------------------------------------------------

/*
 * online artık ZİYARETÇİ sayıyor, profil değil.
 *
 * Giriş yapmış kullanıcı da her açılışta aynı satıra dokunduğu için ikisi
 * ayrı ayrı toplanmıyor — mükerrer sayım yok.
 *
 * total ise "oyuncu" demek ve kayıtlı hesabı sayıyor; etiket de öyle diyor.
 */
create or replace view public.site_stats
with (security_invoker = true) as
  select
    public.online_count() as online,
    (select count(*) from public.profiles where not coalesce(is_bot, false)) as total;
