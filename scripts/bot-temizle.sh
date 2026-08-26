#!/usr/bin/env bash
# Toplu bot temizliği — ritim kuralına uyan hesapların oylarını siler.
# VARSAYILAN: KURU ÇALIŞMA (yalnızca rapor). Gerçekten silmek için --uygula.
#
# NEDEN VAR
#
# scripts/bot-temizle.sql aynı işi Supabase SQL Editor'dan yapar; bu betik onun
# otomasyon hâlidir: GitHub Actions iş akışı (hedef: bot-temizle) bu betiği
# çağırır, çıktıyı iş özetine yazar. Kural iki yerde de AYNI olmalı —
# değiştirirsen ikisini birden güncelle.
#
# Bir hesabı "bot" sayan kural (bkz. bot-temizle.sql):
#   - en az 30 oy,
#   - medyan aralık 50-75 sn VE aralıkların ≥%80'i o bandın içinde (dakikada
#     1 oy ritmi), YA DA
#   - medyan ≤35 sn VE aralıkların ≥%60'ı 10-32 sn bandında (hızlı oy ritmi),
#   - aktif hızlı oy aboneliği (fast_votes_until) OLANLAR DIŞARIDA.
#
# Silme işlemi tek işlemde: sınırsız hak alınır, province_tallies düşürülür,
# oylar silinir, sayaçlar sıfırlanır, is_bot = true işaretlenir, koltuklar
# serbest bırakılır (ayrıntı: bot-temizle.sql).
#
# Kullanım:
#   bot-temizle.sh            → yalnızca rapor
#   bot-temizle.sh --uygula   → gerçekten siler (GERİ ALINAMAZ)
# Ortam: SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail

uygula="no"
for a in "$@"; do [ "$a" = "--uygula" ] && uygula="yes"; done

betikler="$(cd "$(dirname "$0")" && pwd)"

yaz() {
  python3 - "$1" <<'PY'
import json, sys
try:
    satirlar = json.load(open(sys.argv[1]))
except Exception as e:
    print(f"  yanıt okunamadı: {e}"); sys.exit()
if not isinstance(satirlar, list) or not satirlar:
    print("  (kayıt yok)"); sys.exit()
b = list(satirlar[0].keys())
g = {k: max(len(k), *(len(str(s.get(k, ""))) for s in satirlar)) for k in b}
print("  " + "  ".join(k.ljust(g[k]) for k in b))
print("  " + "  ".join("-" * g[k] for k in b))
for s in satirlar:
    print("  " + "  ".join(str(s.get(k, "")).ljust(g[k]) for k in b))
PY
}

sor() {
  echo; echo "── $1"
  if "$betikler/supabase-query.sh" "$2" > /tmp/bot-temizle.json 2>/tmp/bot-temizle.err; then
    yaz /tmp/bot-temizle.json
  else
    echo "  sorgu başarısız:"; sed 's/^/  /' /tmp/bot-temizle.err; return 1
  fi
}

# Ritim kuralı — bot-temizle.sql ile birebir aynı (iki yerde de güncelle).
# Kapsam: aktif ödeme yapanlar hariç; is_bot zaten işaretli olanlar hariç.
KURAL="
with araliklar as (
  select user_id, created_at,
         extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
  from public.votes where source is distinct from 'rally'
),
istatistik as (
  select user_id, count(*) as oy,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric / nullif(count(sn),0), 3) as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric / nullif(count(sn),0), 3) as band20
  from araliklar group by user_id
)
select p.id
from istatistik s
join public.profiles p on p.id = s.user_id
where not coalesce(p.is_bot, false)
  and s.oy >= 30
  and ((s.medyan between 50 and 75 and s.band60 >= 0.8)
       or (s.medyan <= 35 and s.band20 >= 0.6))
  and not (p.fast_votes_until is not null and p.fast_votes_until > now())
"

echo "════ mod: $([ "$uygula" = yes ] && echo SİLME || echo 'kuru çalışma') ════"

# 1) Tespit listesi (rapor — hesap, oy, ritim, koltuk)
sor "Ritim kuralına uyan hesaplar" "
with araliklar as (
  select user_id, created_at,
         extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
  from public.votes where source is distinct from 'rally'
),
istatistik as (
  select user_id, count(*) as oy,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric / nullif(count(sn),0), 3) as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric / nullif(count(sn),0), 3) as band20,
         min(created_at) as ilk_oy, max(created_at) as son_oy
  from araliklar group by user_id
),
tespit as (
  select p.id, p.handle, p.linked_provider,
         (p.fast_votes_until is not null and p.fast_votes_until > now()) as hizli_odeme,
         s.oy, s.medyan, s.band60, s.band20,
         to_char(p.created_at, 'DD.MM HH24:MI') as hesap_acilis,
         to_char(s.ilk_oy, 'DD.MM HH24:MI') as ilk_oy,
         to_char(s.son_oy, 'DD.MM HH24:MI') as son_oy,
         (select count(*) from public.leader_seats k where k.user_id = p.id) as koltuk
  from istatistik s
  join public.profiles p on p.id = s.user_id
  where not coalesce(p.is_bot, false)
    and s.oy >= 30
    and ((s.medyan between 50 and 75 and s.band60 >= 0.8)
         or (s.medyan <= 35 and s.band20 >= 0.6))
)
select handle,
       case when hizli_odeme then 'EVET — ödemeli, karar senin' else 'hayır' end as hizli_odeme,
       oy, round(medyan) as medyan_sn, band60, band20,
       hesap_acilis, ilk_oy, son_oy, koltuk
from tespit
order by oy desc"

# 2) Parti kırılımı (hangi partilere akıyor?)
sor "Bu oyların parti kırılımı" "
with araliklar as (
  select user_id, created_at,
         extract(epoch from (created_at - lag(created_at) over (partition by user_id order by created_at))) as sn
  from public.votes where source is distinct from 'rally'
),
istatistik as (
  select user_id, count(*) as oy,
         percentile_cont(0.5) within group (order by sn) as medyan,
         round((count(*) filter (where sn between 50 and 75))::numeric / nullif(count(sn),0), 3) as band60,
         round((count(*) filter (where sn between 10 and 32))::numeric / nullif(count(sn),0), 3) as band20
  from araliklar group by user_id
)
select v.party_id, count(*) as oy
from public.votes v
join istatistik s on s.user_id = v.user_id
join public.profiles p on p.id = v.user_id
where not coalesce(p.is_bot, false)
  and v.source is distinct from 'rally'
  and s.oy >= 30
  and ((s.medyan between 50 and 75 and s.band60 >= 0.8) or (s.medyan <= 35 and s.band20 >= 0.6))
group by 1 order by 2 desc"

# 3) Aktif hızlı oy aboneleri (temizlik dışı — gözden geçir)
sor "Aktif hızlı oy aboneleri (dışarıda bırakılanlar)" "
select p.handle, p.linked_provider, p.vote_count, p.leader_count,
       to_char(p.fast_votes_until, 'DD.MM HH24:MI') as hizli_bitis
from public.profiles p
where p.fast_votes_until is not null and p.fast_votes_until > now()
order by p.vote_count desc"

if [ "$uygula" != "yes" ]; then
  echo
  echo "Kuru çalışma — hiçbir şey silinmedi."
  echo "Gerçekten silmek için --uygula ekleyin."
  exit 0
fi

# 4) UYGULAMA — tek işlem. Yarıda kalırsa hiçbir şey olmamış gibi geri alınır.
echo
echo "── Siliniyor (tek işlem)"
"$betikler/supabase-query.sh" "
do \$\$
declare
  v_hesap int := 0;
  v_oy    int := 0;
  v_silinen int := 0;
  r       record;
begin
  for r in
    ${KURAL}
  loop
    -- 1. Sınırsız hakkı al: silip bırakırsak aynı betik yeniden doldurur.
    update public.profiles set unlimited_votes = false where id = r.id;
    delete from public.vote_privileges where profile_id = r.id;

    -- 2. Toplam tabloyu silinen kadar DÜŞÜR (yeniden sayma: seed kaybolur).
    update public.province_tallies t
       set votes = greatest(0, t.votes - d.n)
      from (
        select province_id, party_id, count(*)::int as n
        from public.votes where user_id = r.id group by 1, 2
      ) d
     where t.province_id = d.province_id and t.party_id = d.party_id;

    -- 3. Oyları sil.
    delete from public.votes where user_id = r.id;
    get diagnostics v_silinen = row_count;
    v_oy := v_oy + v_silinen;

    -- 4. Sayaçları sıfırla, bot işaretle (liderlikten düşer, oy reddedilir).
    update public.profiles
       set vote_count = 0, xp = 0, leader_count = 0,
           is_bot = true,
           suspected_bot_at = coalesce(suspected_bot_at, now())
     where id = r.id;

    -- 5. Koltukları serbest bırak (ödenmişse karar operatörün).
    delete from public.leader_seats where user_id = r.id;

    v_hesap := v_hesap + 1;
  end loop;

  raise notice 'temizlenen hesap: %, silinen oy: %', v_hesap, v_oy;
end \$\$;
select 'bitti' as durum" > /tmp/bot-temizle.json 2>/tmp/bot-temizle.err \
  && yaz /tmp/bot-temizle.json \
  || { echo "  BAŞARISIZ:"; sed 's/^/  /' /tmp/bot-temizle.err; exit 1; }

# 5) Doğrulama — kalan şüpheli ritim (ödemeli hariç sıfır olmalı)
sor "Sonrası — kalan şüpheli ritim" "
select count(*) as kalan_supheli
from public.suspected_vote_bots
where not hizli_odeme_var"

echo
echo "════ bitti ════"
