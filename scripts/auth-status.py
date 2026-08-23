#!/usr/bin/env python3
"""Supabase auth yapılandırmasını okunur bir tabloya çevirir.

Gizli değerler asla basılmaz; yalnızca "dolu / BOŞ" bilgisi verilir.
Girdi: Yönetim API'sinin /config/auth yanıtı (JSON), dosya yolu argümanla.
"""
import json
import sys

ALANLAR = (
    "external_twitter_enabled",
    "external_twitter_client_id",
    "external_twitter_secret",
    "site_url",
    "uri_allow_list",
)

GIZLI = ("secret", "client_id")


def goster(anahtar: str, deger) -> str:
    if deger is None:
        return "(alan yok)"
    if any(g in anahtar for g in GIZLI):
        return "dolu" if deger else "**BOŞ**"
    if isinstance(deger, bool):
        return "✅ true" if deger else "❌ false"
    return f"`{deger}`" if deger else "**BOŞ**"


def main() -> int:
    with open(sys.argv[1], encoding="utf-8") as fh:
        veri = json.load(fh)

    print("### Supabase auth durumu\n")
    print("| Alan | Değer |")
    print("| --- | --- |")
    for anahtar in ALANLAR:
        print(f"| `{anahtar}` | {goster(anahtar, veri.get(anahtar))} |")

    print()
    if veri.get("external_twitter_enabled"):
        print("X (Twitter) girişi **açık**.")
    else:
        print("X (Twitter) girişi **kapalı** — `twitter-auth` hedefiyle açın.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
