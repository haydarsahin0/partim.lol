#!/usr/bin/env bash
# Bir hesabın oylarını siler ve sayaçları onarır. VARSAYILAN: KURU ÇALIŞMA.
#
# NEDEN AYRI BİR BETİK
#
# Oyları silmek `delete from votes` demek değil. Üç sayaç birden bozulur:
#
#   province_tallies  haritanın okuduğu toplam. Bu tablo votes'tan yeniden
#                     SAYILARAK kurulamaz — içinde açılış tablosu (seed) da
#                     var. Doğrusu, silinen kadar DÜŞMEK.
#   profiles.vote_count / xp   hesabın kendi sayaçları.
#
# Hepsi tek işlemde yapılıyor: yarıda kalırsa hiçbiri olmuyor.
#
# Kullanım:
#   oy-temizle.sh <kullanıcı_adı> [il_id]            → yalnızca raporlar
#   oy-temizle.sh <kullanıcı_adı> [il_id] --uygula   → gerçekten siler
#
# il_id verilmezse hesabın BÜTÜN oyları kapsama girer.
# Ortam: SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail

kullanici="${1:?kullanıcı adı gerekli}"
il="${2:-}"
uygula="no"
for a in "$@"; do [ "$a" = "--uygula" ] && uygula="yes"; done
[ "$il" = "--uygula" ] && il=""

betikler="$(cd "$(dirname "$0")" && pwd)"
guvenli="$(printf '%s' "$kullanici" | sed "s/'/''/g")"
guvenliIl="$(printf '%s' "$il" | sed "s/'/''/g")"

# Kapsam koşulu tek yerde: rapor ile silme aynı satırları görmeli.
if [ -n "$il" ]; then kapsam="v.province_id = '${guvenliIl}'"; else kapsam="true"; fi

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
  if "$betikler/supabase-query.sh" "$2" > /tmp/oy-temizle.json 2>/tmp/oy-temizle.err; then
    yaz /tmp/oy-temizle.json
  else
    echo "  sorgu başarısız:"; sed 's/^/  /' /tmp/oy-temizle.err; return 1
  fi
}

echo "════ @$kullanici · kapsam: ${il:-TÜM İLLER} · mod: $([ "$uygula" = yes ] && echo SİLME || echo 'kuru çalışma') ════"

sor "Silinecek oylar" "
select v.province_id, v.party_id, v.source, count(*) as oy,
       to_char(min(v.created_at), 'DD.MM HH24:MI') as ilk,
       to_char(max(v.created_at), 'DD.MM HH24:MI') as son
from public.votes v
join public.profiles p on p.id = v.user_id
where lower(p.handle) = lower('${guvenli}') and ${kapsam}
group by 1,2,3 order by 4 desc"

if [ "$uygula" != "yes" ]; then
  echo
  echo "Kuru çalışma — hiçbir şey silinmedi."
  echo "Gerçekten silmek için sonuna --uygula ekleyin."
  exit 0
fi

echo
echo "── Siliniyor (tek işlem)"
"$betikler/supabase-query.sh" "
do \$\$
declare
  v_id    uuid;
  v_silinen int;
begin
  select id into v_id from public.profiles where lower(handle) = lower('${guvenli}');
  if v_id is null then raise exception 'Böyle bir hesap yok: ${guvenli}'; end if;

  -- 1. Sınırsız hakkı al: silip bırakırsak aynı betik yeniden doldurur.
  update public.profiles
     set unlimited_votes = false, unlimited_granted_at = null
   where id = v_id;
  delete from public.vote_privileges where profile_id = v_id;

  -- 2. Toplam tabloyu silinen kadar DÜŞÜR (yeniden sayma: seed kaybolur).
  update public.province_tallies t
     set votes = greatest(0, t.votes - d.n)
    from (
      select v.province_id, v.party_id, count(*)::int as n
      from public.votes v
      where v.user_id = v_id and ${kapsam}
      group by 1,2
    ) d
   where t.province_id = d.province_id and t.party_id = d.party_id;

  -- 3. Oyları sil.
  delete from public.votes v where v.user_id = v_id and ${kapsam};
  get diagnostics v_silinen = row_count;

  -- 4. Hesabın kendi sayaçları.
  update public.profiles
     set vote_count = greatest(0, vote_count - v_silinen),
         xp         = greatest(0, xp - v_silinen)
   where id = v_id;

  raise notice 'silinen oy: %', v_silinen;
end \$\$;
select 'bitti' as durum" > /tmp/oy-temizle.json 2>/tmp/oy-temizle.err \
  && yaz /tmp/oy-temizle.json \
  || { echo "  BAŞARISIZ:"; sed 's/^/  /' /tmp/oy-temizle.err; exit 1; }

sor "Sonrası — hesabın kalan oyları" "
select coalesce(count(*), 0) as kalan_oy
from public.votes v join public.profiles p on p.id = v.user_id
where lower(p.handle) = lower('${guvenli}')"

if [ -n "$il" ]; then
  sor "Sonrası — ${il} toplam tablosu" "
  select party_id, votes from public.province_tallies
  where province_id = '${guvenliIl}' order by votes desc"
fi

echo
echo "════ bitti ════"
