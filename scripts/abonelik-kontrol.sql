-- Bir kullanıcının aboneliği hesabına düşmüş mü?
--
-- KULLANIM
--   Supabase → SQL Editor → aşağıdaki e-postayı değiştir → çalıştır.
--
-- NEDEN BU DOSYA VAR
--   E-posta düz metin saklanmıyor (profiles tablosunu herkes okuyabildiği için
--   kimlik, e-postanın SHA-256 özeti olarak ayrı bir tabloda duruyor). Bu
--   yüzden "şu e-postanın hesabı ne durumda" sorusunu elle sormak kolay değil;
--   sorgu burada hazır dursun.

\set eposta 'baranbalci530@gmail.com'

with hedef as (
  select p.*
  from public.profile_identities pi
  join public.profiles p on p.id = pi.profile_id
  where pi.subject = encode(sha256(convert_to(lower(trim(:'eposta')), 'UTF8')), 'hex')
)
select
  case when exists (select 1 from hedef) then 'hesap bulundu'
       else 'HESAP YOK — bu e-postayla hiç giriş yapılmamış' end          as durum,
  (select handle          from hedef)                                     as kullanici_adi,
  (select linked_provider from hedef)                                     as saglayici,

  -- Asıl soru
  (select case
            when fast_votes_until is null then 'HAYIR — abonelik hesabına düşmemiş'
            when fast_votes_until > now() then 'EVET — abonelik etkin'
            else 'SÜRESİ DOLMUŞ (' || to_char(fast_votes_until, 'DD.MM.YYYY HH24:MI') || ')'
          end from hedef)                                                 as abonelik,

  (select to_char(fast_votes_until, 'DD.MM.YYYY HH24:MI') from hedef)     as biter,
  (select to_char(fast_votes_since, 'DD.MM.YYYY HH24:MI') from hedef)     as basladi,
  (select case when fast_votes_cancel_at is null then 'hayır'
               else 'EVET — ' || to_char(fast_votes_cancel_at, 'DD.MM HH24:MI') || ' bitecek'
          end from hedef)                                                 as iptal_edilmis,
  (select fast_votes_subscription_id from hedef)                          as stripe_abonelik,
  (select stripe_customer_id         from hedef)                          as stripe_musteri,
  (select vote_count                 from hedef)                          as oy_sayisi,
  (select to_char(last_seen_at, 'DD.MM.YYYY HH24:MI') from hedef)         as son_gorulme;

-- Gerekli fonksiyonlar sunucuda var mı? (Yoksa ödeme sessizce düşer.)
select p.proname as fonksiyon,
       pg_get_function_identity_arguments(p.oid) as parametreler
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('apply_fast_votes_subscription', 'find_profile_by_email', 'handle_available',
                     'set_fast_votes_cancel', 'cancel_fast_votes_subscription')
order by 1, 2;

-- Son 24 saatte aboneliği düşen herkes (webhook çalışıyor mu?)
select handle,
       to_char(fast_votes_since, 'DD.MM HH24:MI') as basladi,
       to_char(fast_votes_until, 'DD.MM HH24:MI') as biter,
       fast_votes_subscription_id
from public.profiles
where fast_votes_since > now() - interval '24 hours'
order by fast_votes_since desc;
