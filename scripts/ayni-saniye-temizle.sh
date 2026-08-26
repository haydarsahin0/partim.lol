#!/usr/bin/env bash
# AYNI SANİYEDE açılmış bot hesap kümelerini bulur ve (--uygula ile) siler.
# VARSAYILAN: KURU ÇALIŞMA (yalnızca rapor). Gerçekten silmek için --uygula.
#
# İMZA
#
# Bot çiftliği hesapları betikle toplu açıyor: aynı saniyede birden fazla
# anonim 'oyuncuXXXXX' hesabı. İnsan böyle hesap açmaz — iki ayrı kişinin
# tam aynı saniyede kaydolması pratikte imkânsız. Küme kuralı:
#
#   - aynı saniyede (date_trunc('second', created_at)) açılmış,
#   - kümedeki HER hesap anonim (linked_provider boş),
#   - kümedeki HER hesabın kullanıcı adı 'oyuncu' ile başlıyor (otomatik üretim),
#   - henüz is_bot işaretlenmemiş.
#
# Önizleme ≥2 hesabı gösterir; silme (--uygula) ≥3 olan kümeleri kapsar
# (2'li küme kuşkulu ama "kesin" değil — operatör kapsamı görmeli).
#
# Silme işlemi tek işlemde (oy-temizle.sh ile aynı adımlar):
#   1. Sınırsız hak alınır (betik yeniden doldurmasın)
#   2. province_tallies silinen kadar DÜŞÜRÜLÜR (seed korunur)
#   3. Oylar silinir
#   4. Sayaçlar sıfırlanır, is_bot = true (liderlikten düşer, oy reddedilir)
#   5. Koltuklar serbest bırakılır
#
# Kullanım:
#   ayni-saniye-temizle.sh                  → yalnızca rapor (önizleme ≥2)
#   ayni-saniye-temizle.sh --uygula         → gerçekten siler, küme eşiği ≥3
#   ayni-saniye-temizle.sh --uygula --esik 2  → 2+ hesaptan oluşan kümeleri siler
# Ortam: SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail

uygula="no"
esik=3
while [ $# -gt 0 ]; do
  case "$1" in
    --uygula) uygula="yes" ;;
    --esik) esik="${2:-3}"; shift ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 2 ;;
  esac
  shift
done

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
  if "$betikler/supabase-query.sh" "$2" > /tmp/ayni-saniye.json 2>/tmp/ayni-saniye.err; then
    yaz /tmp/ayni-saniye.json
  else
    echo "  sorgu başarısız:"; sed 's/^/  /' /tmp/ayni-saniye.err; return 1
  fi
}

echo "════ mod: $([ "$uygula" = yes ] && echo SİLME || echo 'kuru çalışma') ════"

# 1) Aynı saniyede açılan kümeler (önizleme ≥2)
sor "Aynı saniyede açılan hesap kümeleri (≥2)" "
with kume as (
  select date_trunc('second', created_at) as sn,
         count(*) as hesap,
         sum(vote_count) as toplam_oy,
         bool_and(coalesce(linked_provider, '') = '') as hepsi_anonim,
         bool_and(lower(handle) like 'oyuncu%') as hepsi_oyuncu,
         to_char(min(created_at), 'DD.MM HH24:MI:SS') as acilis
  from public.profiles
  where not coalesce(is_bot, false)
  group by 1
  having count(*) >= 2
)
select acilis,
       hesap,
       toplam_oy,
       case when hepsi_anonim and hepsi_oyuncu then 'BOT' else 'incele' end as durum
from kume
order by hesap desc, acilis"

# 2) Bot kümelerindeki hesapların listesi (kuru çalışmada operatör gözden geçirir)
sor "Bot kümelerindeki hesaplar" "
with kume as (
  select date_trunc('second', created_at) as sn
  from public.profiles
  where not coalesce(is_bot, false)
  group by 1
  having count(*) >= 2
    and bool_and(coalesce(linked_provider, '') = '')
    and bool_and(lower(handle) like 'oyuncu%')
)
select p.handle,
       p.vote_count,
       to_char(p.created_at, 'DD.MM HH24:MI:SS') as acilis,
       coalesce(p.linked_provider, '') as saglayici
from public.profiles p
join kume k on date_trunc('second', p.created_at) = k.sn
where not coalesce(p.is_bot, false)
order by p.created_at, p.handle"

if [ "$uygula" != "yes" ]; then
  echo
  echo "Kuru çalışma — hiçbir şey silinmedi."
  echo "Gerçekten silmek için --uygula ekleyin."
  exit 0
fi

# 3) UYGULAMA — tek işlem. Küme eşiği varsayılan ≥3 (2'li kümeler operatör kararı).
echo
echo "── Siliniyor (tek işlem, küme eşiği ≥${esik})"
"$betikler/supabase-query.sh" "
do \$\$
declare
  v_hesap int := 0;
  v_oy    int := 0;
  v_silinen int := 0;
  r       record;
begin
  for r in
    with kume as (
      select date_trunc('second', created_at) as sn
      from public.profiles
      where not coalesce(is_bot, false)
      group by 1
      having count(*) >= ${esik}
        and bool_and(coalesce(linked_provider, '') = '')
        and bool_and(lower(handle) like 'oyuncu%')
    )
    select p.id
    from public.profiles p
    join kume k on date_trunc('second', p.created_at) = k.sn
    where not coalesce(p.is_bot, false)
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
           is_bot = true
     where id = r.id;

    -- 5. Koltukları serbest bırak (ödenmişse karar operatörün).
    delete from public.leader_seats where user_id = r.id;

    v_hesap := v_hesap + 1;
  end loop;

  raise notice 'temizlenen hesap: %, silinen oy: %', v_hesap, v_oy;
end \$\$;
select 'bitti' as durum" > /tmp/ayni-saniye.json 2>/tmp/ayni-saniye.err \
  && yaz /tmp/ayni-saniye.json \
  || { echo "  BAŞARISIZ:"; sed 's/^/  /' /tmp/ayni-saniye.err; exit 1; }

# 4) Doğrulama — kalan aynı-saniye kümeleri (≥esik sıfır olmalı)
sor "Sonrası — kalan aynı saniye kümeleri (≥${esik})" "
with kume as (
  select date_trunc('second', created_at) as sn,
         count(*) as hesap,
         sum(vote_count) as toplam_oy
  from public.profiles
  where not coalesce(is_bot, false)
  group by 1
  having count(*) >= ${esik}
    and bool_and(coalesce(linked_provider, '') = '')
    and bool_and(lower(handle) like 'oyuncu%')
)
select count(*) as kalan_kume, coalesce(sum(hesap), 0) as kalan_hesap,
       coalesce(sum(toplam_oy), 0) as kalan_oy
from kume"

echo
echo "════ bitti ════"
