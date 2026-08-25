#!/usr/bin/env bash
# Oyuncu sayısı neden artmıyor? SALT OKUNUR.
#
# İki ihtimali ayırt etmek için var:
#
#   A) TALEP DÜŞTÜ — siteye gelen az. O zaman hem yeni hesap hem oy hem
#      çevrimiçi sayısı birlikte iner; eğri yumuşaktır.
#   B) BİR ŞEY ENGELLİYOR — trafik var ama hesap açılmıyor. O zaman oy ve
#      çevrimiçi sürerken YENİ HESAP eğrisi bir uçurumla düşer, üstelik
#      düşüş bir dağıtım saatine denk gelir.
#
# Ayırt edici asıl sorgu 4 numara: hesap açma sınırına çarpan cihaz imzaları.
# Sınır KABA imzaya bakıyor (ekran+saat dilimi+dil+platform) ve o imza aynı
# model telefonu aynı ülkede kullanan farklı kişilerde AYNI çıkabiliyor.
#
# Kullanım: buyume-kontrol.sh
# Ortam:    SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail
betikler="$(cd "$(dirname "$0")" && pwd)"

sor() {
  echo; echo "── $1"
  if ! "$betikler/supabase-query.sh" "$2" > /tmp/buyume.json 2>/tmp/buyume.err; then
    echo "  sorgu başarısız:"; sed 's/^/  /' /tmp/buyume.err; return 0
  fi
  python3 - /tmp/buyume.json <<'PY'
import json, sys
try:
    r = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  yanıt okunamadı: {e}"); sys.exit()
if not isinstance(r, list) or not r:
    print("  (kayıt yok)"); sys.exit()
b = list(r[0].keys())
g = {k: max(len(k), *(len(str(s.get(k, ""))) for s in r)) for k in b}
print("  " + "  ".join(k.ljust(g[k]) for k in b))
print("  " + "  ".join("-" * g[k] for k in b))
for s in r:
    print("  " + "  ".join(str(s.get(k, "")).ljust(g[k]) for k in b))
PY
}

echo "════ büyüme kontrolü · $(date -u '+%d.%m %H:%M UTC') ════"

sor "1. Şu anki sayaçlar" "
select online as cevrimici, total as oyuncu from public.site_stats"

sor "2. SAATLİK: yeni hesap / aktif kullanıcı / oy  (son 36 saat)" "
with saatler as (
  select generate_series(date_trunc('hour', now()) - interval '35 hours',
                         date_trunc('hour', now()), interval '1 hour') as saat
)
select to_char(s.saat, 'DD.MM HH24:00') as saat,
       (select count(*) from public.profiles p
         where not coalesce(p.is_bot,false)
           and p.created_at >= s.saat and p.created_at < s.saat + interval '1 hour') as yeni_hesap,
       (select count(*) from public.profiles p
         where not coalesce(p.is_bot,false)
           and p.last_seen_at >= s.saat and p.last_seen_at < s.saat + interval '1 hour') as aktif,
       (select count(*) from public.votes v
         where v.created_at >= s.saat and v.created_at < s.saat + interval '1 hour') as oy
from saatler s
order by s.saat desc"

sor "3. Yeni hesaplar sağlayıcıya göre (son 48 saat)" "
select coalesce(linked_provider, 'cihaz (Google yok)') as saglayici,
       count(*) as hesap,
       to_char(max(created_at), 'DD.MM HH24:MI') as sonuncusu
from public.profiles
where not coalesce(is_bot,false) and created_at > now() - interval '48 hours'
group by 1 order by 2 desc"

sor "4. HESAP AÇMA SINIRINA ÇARPAN CİHAZ İMZALARI (son 24 saat, sınır: 3)" "
select left(signup_device_hash, 8) as imza,
       count(*) as son24s_hesap,
       case when count(*) >= 3 then 'SINIRDA — yeni hesap AÇILAMIYOR' else 'serbest' end as durum,
       to_char(min(created_at), 'DD.MM HH24:MI') as ilk,
       to_char(max(created_at), 'DD.MM HH24:MI') as son
from public.profiles
where not coalesce(is_bot,false)
  and signup_device_hash is not null
  and created_at > now() - interval '24 hours'
group by 1
order by 2 desc
limit 15"

sor "5. Kaba imza ne kadar çakışıyor? (tüm zamanlar)" "
select count(*)                                as hesap,
       count(distinct signup_device_hash)       as farkli_imza,
       round(count(*)::numeric
             / nullif(count(distinct signup_device_hash),0), 2) as imza_basina_hesap
from public.profiles
where not coalesce(is_bot,false) and signup_device_hash is not null"

sor "6. En kalabalık imzalar (tüm zamanlar) — çakışma kanıtı" "
select left(signup_device_hash, 8) as imza, count(*) as hesap,
       count(*) filter (where linked_provider is not null) as googleli,
       to_char(min(created_at), 'DD.MM') as ilk,
       to_char(max(created_at), 'DD.MM HH24:MI') as son
from public.profiles
where not coalesce(is_bot,false) and signup_device_hash is not null
group by 1 order by 2 desc limit 10"

echo
echo "════ bitti — hiçbir kayıt değiştirilmedi ════"
