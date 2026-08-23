#!/usr/bin/env bash
# Supabase Yönetim API'siyle tek bir SQL sorgusu çalıştırır ve yanıtı basar.
#
# Neden var: `supabase db push` yeşil dönse bile veritabanında ne olduğunu
# söylemiyor — uygulanmış bir sürüm numarası sessizce atlanabiliyor. Dağıtımdan
# sonra "gerçekten ne var?" sorusunu bu betikle soruyoruz.
#
# curl kullanıyoruz: api.supabase.com Cloudflare arkasında ve bazı istemci
# imzalarını 403 ile reddediyor; ilk deneme reddedilirse tarayıcı benzeri bir
# User-Agent ile bir kez daha deneriz (bkz. supabase-auth.sh).
#
# Kullanım:  supabase-query.sh "select count(*) from public.profiles"
# Ortam:     SUPABASE_ACCESS_TOKEN, PROJECT_REF

set -euo pipefail

sorgu="${1:?SQL sorgusu gerekli}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN gerekli}"
: "${PROJECT_REF:?PROJECT_REF gerekli}"

api="https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query"
yanit="$(mktemp)"
govde="$(mktemp)"
trap 'rm -f "$yanit" "$govde"' EXIT

python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$sorgu" > "$govde"

cagir() {
  curl -sS -o "$yanit" -w '%{http_code}' \
    -A "$1" \
    -X POST \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    --data-binary "@$govde" \
    "$api"
}

kod="$(cagir 'partim-lol-ci/1.0 (+https://github.com/haydarsahin0/partim.lol)')"
if [ "$kod" = "403" ]; then
  kod="$(cagir 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')"
fi

if [ "$kod" != "200" ] && [ "$kod" != "201" ]; then
  echo "Sorgu başarısız (HTTP $kod):" >&2
  cat "$yanit" >&2
  exit 1
fi

cat "$yanit"
