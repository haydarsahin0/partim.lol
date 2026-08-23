#!/usr/bin/env bash
# Supabase Yönetim API'si üzerinden auth ayarlarını okur veya X girişini açar.
#
# curl kullanıyoruz: api.supabase.com Cloudflare arkasında ve bazı istemci
# imzalarını (ör. Python urllib) 403 / "error code: 1010" ile reddediyor.
# İlk deneme reddedilirse tarayıcı benzeri bir User-Agent ile bir kez daha
# deneriz; ikisi de olmazsa yanıt gövdesini olduğu gibi basıp çıkarız.
#
# Kullanım:  supabase-auth.sh oku|ac
# Ortam:     SUPABASE_ACCESS_TOKEN, PROJECT_REF (+ ac için X_CONSUMER_*)

set -euo pipefail

komut="${1:-}"
case "$komut" in
  oku | ac) ;;
  *)
    echo "Kullanım: $0 oku|ac" >&2
    exit 2
    ;;
esac

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN gerekli}"
: "${PROJECT_REF:?PROJECT_REF gerekli}"

api="https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth"
yanit="$(mktemp)"
govde=""
trap 'rm -f "$yanit" "$govde"' EXIT

ekler=()
if [ "$komut" = "ac" ]; then
  govde="$(mktemp)"
  python3 "$(dirname "$0")/twitter-auth-body.py" > "$govde"
  ekler=(-X PATCH -H "Content-Type: application/json" --data-binary "@$govde")
fi

cagir() {
  curl -sS -o "$yanit" -w '%{http_code}' \
    -A "$1" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
    "${ekler[@]}" \
    "$api"
}

kod="$(cagir 'partim-lol-ci/1.0 (+https://github.com/haydarsahin0/partim.lol)')"
if [ "$kod" = "403" ]; then
  echo "İlk deneme 403 döndü (Cloudflare imza engeli olabilir), tekrar deneniyor…" >&2
  kod="$(cagir 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')"
fi

if [ "$kod" -ge 300 ]; then
  echo "::error::Supabase API isteği başarısız (HTTP $kod)" >&2
  cat "$yanit" >&2
  echo >&2
  exit 1
fi

if [ "$komut" = "ac" ]; then
  echo "Sağlayıcı ayarı yazıldı (HTTP $kod)."
else
  cat "$yanit"
fi
