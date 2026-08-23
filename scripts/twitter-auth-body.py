#!/usr/bin/env python3
"""X (Twitter) sağlayıcısını açacak PATCH gövdesini üretir.

Yalnızca JSON basar; ağ isteğini supabase-auth.sh curl ile yapar. Sebep:
api.supabase.com Cloudflare arkasında ve Python'un urllib istemci imzasını
403 / "error code: 1010" ile reddediyor.

Ortam: X_CONSUMER_KEY, X_CONSUMER_SECRET
"""
import json
import os
import sys


def main() -> int:
    key = os.environ.get("X_CONSUMER_KEY", "")
    secret = os.environ.get("X_CONSUMER_SECRET", "")

    eksik = [ad for ad, d in (("X_CONSUMER_KEY", key), ("X_CONSUMER_SECRET", secret)) if not d]
    if eksik:
        print(f"::error::Eksik secret: {', '.join(eksik)}", file=sys.stderr)
        return 1

    json.dump(
        {
            "external_twitter_enabled": True,
            "external_twitter_client_id": key,
            "external_twitter_secret": secret,
        },
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
