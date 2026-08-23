#!/usr/bin/env python3
"""Supabase Yönetim API'si üzerinden X (Twitter) girişini açar.

Panelden "Save" bazen sessizce başarısız oluyor; bu betik ayarı doğrudan yazar.
Anahtarlar ortam değişkenlerinden okunur ve hiçbir zaman basılmaz.

Ortam: SUPABASE_ACCESS_TOKEN, PROJECT_REF, X_CONSUMER_KEY, X_CONSUMER_SECRET
"""
import json
import os
import sys
import urllib.error
import urllib.request


def main() -> int:
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    ref = os.environ.get("PROJECT_REF", "")
    key = os.environ.get("X_CONSUMER_KEY", "")
    secret = os.environ.get("X_CONSUMER_SECRET", "")

    eksik = [
        ad
        for ad, deger in (
            ("SUPABASE_ACCESS_TOKEN", token),
            ("SUPABASE_PROJECT_REF", ref),
            ("X_CONSUMER_KEY", key),
            ("X_CONSUMER_SECRET", secret),
        )
        if not deger
    ]
    if eksik:
        print(f"::error::Eksik ayar: {', '.join(eksik)}")
        return 1

    govde = json.dumps(
        {
            "external_twitter_enabled": True,
            "external_twitter_client_id": key,
            "external_twitter_secret": secret,
        }
    ).encode()

    istek = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/config/auth",
        data=govde,
        method="PATCH",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(istek) as yanit:
            print(f"PATCH başarılı: HTTP {yanit.status}")
    except urllib.error.HTTPError as hata:
        detay = hata.read().decode("utf-8", "replace")
        print(f"::error::Sağlayıcı açılamadı (HTTP {hata.code}): {detay}")
        return 1
    except urllib.error.URLError as hata:
        print(f"::error::Supabase API'sine ulaşılamadı: {hata.reason}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
