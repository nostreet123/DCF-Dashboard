#!/usr/bin/env python3
"""Verify signed access to the hosted DCF engine using .env.render (no secrets printed)."""

from __future__ import annotations

import hashlib
import hmac
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path


def load_env_render(repo_root: Path) -> None:
    env_file = repo_root / ".env.render"
    if not env_file.is_file():
        raise SystemExit(f"Missing {env_file}. Run ./scripts/export_render_env.sh first.")

    for line in env_file.read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ[key] = value


def signed_get(url: str, path: str, secret: str) -> tuple[int, str]:
    method = "GET"
    body = ""
    timestamp_ms = str(int(time.time() * 1000))
    nonce = str(uuid.uuid4())
    body_hash = hashlib.sha256(body.encode()).hexdigest()
    payload = f"{method}\n{path}\n{timestamp_ms}\n{nonce}\n{body_hash}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        url,
        method="GET",
        headers={
            "Content-Type": "application/json",
            "x-dcf-internal-signature": signature,
            "x-dcf-internal-ts": timestamp_ms,
            "x-dcf-internal-nonce": nonce,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, response.read(200).decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read(200).decode("utf-8", "replace")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    load_env_render(repo_root)

    base = "https://dcf-engine.onrender.com"
    secret = os.getenv("DCF_ENGINE_INTERNAL_KEY", "")
    convex_url = os.getenv("CONVEX_URL", "")
    sync_token = os.getenv("DAMODARAN_SYNC_TOKEN", "")
    sec_agent = os.getenv("SEC_USER_AGENT", "")

    print("Local .env.render checklist:")
    print(f"  DCF_ENGINE_INTERNAL_KEY: {'set' if len(secret) == 64 else 'MISSING/WRONG LENGTH'}")
    print(f"  DAMODARAN_SYNC_TOKEN: {'set' if len(sync_token) >= 32 else 'MISSING/SHORT'}")
    print(f"  CONVEX_URL: {convex_url or 'MISSING'}")
    print(f"  SEC_USER_AGENT: {'set' if sec_agent else 'MISSING'}")
    print()

    health_url = f"{base}/healthz"
    try:
        with urllib.request.urlopen(health_url, timeout=90) as response:
            print(f"GET /healthz -> {response.status}")
    except urllib.error.HTTPError as exc:
        print(f"GET /healthz -> {exc.code}")
        return 1

    path = "/sec/facts?symbol=AAPL"
    status, body = signed_get(f"{base}{path}", path, secret)
    print(f"Signed GET {path} -> {status}")
    if body:
        print(f"  body: {body[:160]}")

    if status == 200:
        print("\nOK: Render accepts the key from .env.render.")
        print("If Vercel still fails, re-run ./scripts/push_vercel_env.sh and redeploy.")
        return 0

    if status == 401:
        print(
            "\nFAIL: Render rejected the signature from .env.render.\n"
            "Render dashboard env is OUT OF SYNC. In Render -> dcf-engine -> Environment,\n"
            "set DCF_ENGINE_INTERNAL_KEY (and DAMODARAN_SYNC_TOKEN, CONVEX_URL) from .env.render,\n"
            "then wait for the service to restart."
        )
        return 1

    if status == 503:
        print(
            "\nFAIL: Render security backend unavailable (Convex/token config on Render).\n"
            "Confirm CONVEX_URL and DAMODARAN_SYNC_TOKEN on Render match Convex production."
        )
        return 1

    print(f"\nUnexpected status {status}. Check Render logs.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
