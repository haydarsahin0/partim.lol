#!/usr/bin/env bash
# Bir kullanıcıyı ve bir ildeki oy hareketini inceler. HİÇBİR ŞEY DEĞİŞTİRMEZ.
#
# NEDEN VAR
#
# "Şu kullanıcı şu ile bot atmış" gibi bir şüphe, ancak veriye bakılarak
# doğrulanabilir. Elle sorgu yazmak her seferinde yeniden düşünmek demek;
# soruları bir kez doğru sorup buraya koyuyoruz.
#
# NEYE BAKIYOR
#   1. Hesabın kendisi (ne zaman açılmış, kaç oy, cihaz kaydı var mı)
#   2. O ildeki oyları — parti ve kaynak (vote / rally) kırılımında
#   3. OYLAR ARASI ARALIK — betiğin imzası budur. İnsan düzensiz oy verir;
#      betik neredeyse hep aynı saniyede döner.
#   4. O ilde oy veren herkes — tek hesap mı, hesap kümesi mi?
#   5. Aynı tarayıcıda açılmış diğer hesaplar
#   6. İldeki koltuklar ve son miting
#   7. Toplam tablo gerçek oylarla tutuyor mu?
#
# Kullanım:  oyuncu-incele.sh <kullanıcı_adı> [il_id]
# Ortam:     SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail

kullanici="${1:?kullanıcı adı gerekli (ör. oyuncu32661)}"
il="${2:-bartin}"
betikler="$(cd "$(dirname "$0")" && pwd)"

# Tek tırnak kaçışı: kullanıcı adı sorguya metin olarak giriyor.
guvenli="$(printf '%s' "$kullanici" | sed "s/'/''/g")"
guvenliIl="$(printf '%s' "$il" | sed "s/'/''/g")"

sor() {
  local baslik="$1" sql="$2"
  echo
  echo "── $baslik"
  if ! "$betikler/supabase-query.sh" "$sql" > /tmp/oyuncu-incele.json 2>/tmp/oyuncu-incele.err; then
    echo "  sorgu başarısız:"; sed 's/^/  /' /tmp/oyuncu-incele.err; return 0
  fi
  python3 - /tmp/oyuncu-incele.json <<'PY'
import json, sys
try:
    satirlar = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  yanıt okunamadı: {e}"); sys.exit()
if not isinstance(satirlar, list) or not satirlar:
    print("  (kayıt yok)"); sys.exit()
basliklar = list(satirlar[0].keys())
gen = {b: max(len(b), *(len(str(s.get(b, ""))) for s in satirlar)) for b in basliklar}
print("  " + "  ".join(b.ljust(gen[b]) for b in basliklar))
print("  " + "  ".join("-" * gen[b] for b in basliklar))
for s in satirlar:
    print("  " + "  ".join(str(s.get(b, "")).ljust(gen[b]) for b in basliklar))
PY
}

echo "════ @$kullanici · il: $il ════"

sor "1. Hesap" "
select p.handle, p.display_name, p.is_bot, p.vote_count, p.leader_count,
       coalesce(p.linked_provider, '-')                as saglayici,
       coalesce(p.unlimited_votes, false)              as sinirsiz_oy,
       (p.device_id is not null)                       as cihaz_kayitli,
       left(coalesce(p.signup_device_hash, '-'), 8)    as kayit_imzasi,
       to_char(p.created_at,   'DD.MM HH24:MI')        as acildi,
       to_char(p.last_seen_at, 'DD.MM HH24:MI')        as son_gorulme
from public.profiles p
where lower(p.handle) = lower('${guvenli}')"

sor "2. Bu hesabın ${il} oyları" "
select v.party_id, v.source, count(*) as oy,
       to_char(min(v.created_at), 'DD.MM HH24:MI:SS') as ilk,
       to_char(max(v.created_at), 'DD.MM HH24:MI:SS') as son
from public.votes v
join public.profiles p on p.id = v.user_id
where lower(p.handle) = lower('${guvenli}')
  and v.province_id = '${guvenliIl}'
group by 1, 2
order by 3 desc"

sor "3. Oylar arası aralık (betik imzası — tek bir saniyede yığılma şüphelidir)" "
with o as (
  select v.created_at,
         lag(v.created_at) over (order by v.created_at) as onceki
  from public.votes v
  join public.profiles p on p.id = v.user_id
  where lower(p.handle) = lower('${guvenli}')
    and v.source is distinct from 'rally'
)
select round(extract(epoch from (created_at - onceki)))::int as saniye,
       count(*) as kez
from o
where onceki is not null
group by 1
order by 2 desc
limit 12"

sor "4. ${il} ilinde oy veren herkes" "
select p.handle, p.is_bot, count(*) as oy,
       count(*) filter (where v.source = 'rally') as miting_oyu,
       to_char(min(v.created_at), 'DD.MM HH24:MI') as ilk,
       to_char(max(v.created_at), 'DD.MM HH24:MI') as son
from public.votes v
join public.profiles p on p.id = v.user_id
where v.province_id = '${guvenliIl}'
group by 1, 2
order by 3 desc
limit 20"

sor "5. Aynı tarayıcıda açılmış hesaplar" "
select p2.handle, p2.vote_count, p2.leader_count,
       to_char(p2.created_at, 'DD.MM HH24:MI') as acildi
from public.profiles p1
join public.profiles p2 on p2.signup_device_hash = p1.signup_device_hash
where lower(p1.handle) = lower('${guvenli}')
  and p1.signup_device_hash is not null
order by p2.created_at
limit 40"

sor "6. ${il} koltukları" "
select s.party_id, p.handle, p.is_bot, s.price, s.takeovers,
       to_char(s.held_since,    'DD.MM HH24:MI') as aldi,
       to_char(s.last_rally_at, 'DD.MM HH24:MI') as son_miting
from public.leader_seats s
join public.profiles p on p.id = s.user_id
where s.province_id = '${guvenliIl}'
order by s.price desc"

sor "7. SINIRSIZ OY HAKKI OLAN HERKES (bekleme süresi 0, cihaz bütçesinden muaf)" "
select p.handle, p.vote_count,
       coalesce(p.unlimited_votes, false)                     as sutun_hakki,
       (vp.handle is not null)                                as eski_liste,
       to_char(p.created_at,   'DD.MM HH24:MI')               as acildi,
       to_char(p.last_seen_at, 'DD.MM HH24:MI')               as son_gorulme
from public.profiles p
left join public.vote_privileges vp on lower(vp.handle) = lower(p.handle) and vp.unlimited
where coalesce(p.unlimited_votes, false) or vp.handle is not null
order by p.vote_count desc"

sor "8. Toplam tablo gerçek oylarla tutuyor mu?" "
select coalesce(t.party_id, g.party_id)          as parti,
       coalesce(t.votes, 0)                      as tabloda,
       coalesce(g.n, 0)                          as gercek_oy,
       coalesce(t.votes, 0) - coalesce(g.n, 0)   as fark
from public.province_tallies t
full join (
  select party_id, count(*)::int as n
  from public.votes
  where province_id = '${guvenliIl}'
  group by 1
) g on g.party_id = t.party_id and t.province_id = '${guvenliIl}'
where t.province_id = '${guvenliIl}' or t.province_id is null
order by 2 desc"

echo
echo "════ bitti — hiçbir kayıt değiştirilmedi ════"
