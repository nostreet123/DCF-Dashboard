#!/usr/bin/env python3
"""Fetch active Qodo coding rules for the current repository scope."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen

PAGE_SIZE = 50
MAX_PAGES = 100
CONFIG_PATH = Path.home() / ".qodo" / "config.json"


def main() -> int:
    repo_root = git_output(["rev-parse", "--show-toplevel"])
    if not repo_root:
        print("Qodo rules require a git repository; skipping rule fetch.")
        return 0

    remote_url = git_output(["remote", "get-url", "origin"])
    if not remote_url:
        return 0

    repo_scope = scope_from_remote(remote_url)
    if not repo_scope:
        print(
            "Unable to parse git origin remote URL for Qodo rule scope; "
            "skipping rule fetch."
        )
        return 0

    query_scope = module_scope(repo_scope, Path(repo_root), Path.cwd())
    config = load_config()
    api_key = os.environ.get("QODO_API_KEY") or config.get("API_KEY")
    environment = (
        os.environ.get("QODO_ENVIRONMENT_NAME")
        or config.get("ENVIRONMENT_NAME")
        or ""
    )

    if not api_key:
        print("Qodo API key is not configured; skipping rule fetch.")
        print("Set QODO_API_KEY or create ~/.qodo/config.json with an API_KEY field.")
        return 0

    rules = fetch_rules(api_base_url(environment), api_key, query_scope)
    if rules is None:
        return 0
    if not rules:
        print("No Qodo rules found for scope `{}`.".format(query_scope))
        return 0

    print_rules(query_scope, rules)
    return 0


def git_output(args: List[str]) -> str:
    try:
        result = subprocess.run(
            ["git"] + args,
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            universal_newlines=True,
        )
    except OSError:
        return ""
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def scope_from_remote(remote_url: str) -> str:
    normalized = remote_url.strip()
    ssh_match = re.match(r"^[^@]+@[^:]+:(?P<path>[^#?]+)$", normalized)
    if ssh_match:
        path = ssh_match.group("path")
    else:
        parsed = urlparse(normalized)
        path = parsed.path.lstrip("/") if parsed.scheme and parsed.netloc else ""

    if not path:
        return ""
    if path.endswith(".git"):
        path = path[:-4]

    parts = [quote(part) for part in path.strip("/").split("/") if part]
    if len(parts) < 2:
        return ""
    return "/{}/{}/".format(parts[-2], parts[-1])


def module_scope(repo_scope: str, repo_root: Path, cwd: Path) -> str:
    try:
        relative = cwd.resolve().relative_to(repo_root.resolve())
    except ValueError:
        return repo_scope

    parts = relative.parts
    if len(parts) >= 2 and parts[0] == "modules" and parts[1]:
        return repo_scope + "modules/{}/".format(quote(parts[1]))
    return repo_scope


def load_config() -> Dict[str, Any]:
    try:
        with CONFIG_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def api_base_url(environment: str) -> str:
    environment = environment.strip()
    if environment:
        return "https://qodo-platform.{}.qodo.ai/rules/v1".format(environment)
    return "https://qodo-platform.qodo.ai/rules/v1"


def fetch_rules(base_url: str, api_key: str, query_scope: str) -> Optional[List[Any]]:
    rules = []  # type: List[Any]
    for page in range(1, MAX_PAGES + 1):
        params = urlencode(
            {
                "scopes": query_scope,
                "state": "active",
                "page": page,
                "page_size": PAGE_SIZE,
            }
        )
        url = "{}/rules?{}".format(base_url.rstrip("/"), params)
        request = Request(url, headers={"Authorization": "Bearer {}".format(api_key)})

        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            print(http_error_message(error.code))
            return None
        except URLError:
            print(
                "Unable to connect to the Qodo rules API; "
                "check your internet connection."
            )
            return None
        except (ValueError, OSError):
            print("Unable to parse the Qodo rules API response.")
            return None

        page_rules = payload.get("rules", []) if isinstance(payload, dict) else []
        if not isinstance(page_rules, list):
            print("Unexpected Qodo rules API response format.")
            return None
        rules.extend(page_rules)
        if len(page_rules) < PAGE_SIZE:
            break
    return rules


def http_error_message(status_code: int) -> str:
    messages = {
        401: (
            "Qodo API key is invalid or expired; "
            "update QODO_API_KEY or ~/.qodo/config.json."
        ),
        403: "Qodo rules API access is forbidden for this API key.",
        404: "Qodo rules API endpoint was not found; check QODO_ENVIRONMENT_NAME.",
        429: "Qodo rules API rate limit exceeded; try again later.",
    }
    if 500 <= status_code <= 599:
        return "Qodo rules API is temporarily unavailable; try again later."
    return messages.get(
        status_code,
        "Qodo rules API request failed with HTTP {}.".format(status_code),
    )


def print_rules(query_scope: str, rules: List[Any]) -> None:
    print("# 📋 Qodo Rules Loaded")
    print()
    print("Scope: `{}`".format(query_scope))
    print(
        "Rules loaded: **{}** "
        "(universal, org level, repo level, and path level rules)".format(len(rules))
    )
    print()
    print("These rules must be applied during code generation based on severity:")

    sections = [
        ("error", "## ❌ ERROR Rules (Must Comply)"),
        ("warning", "## ⚠️  WARNING Rules (Should Comply)"),
        ("recommendation", "## 💡 RECOMMENDATION Rules (Consider)"),
    ]
    for severity, heading in sections:
        matching = [
            rule for rule in rules
            if rule_value(rule, "severity").lower() == severity
        ]
        if matching:
            print()
            print("{} - {}".format(heading, len(matching)))
            print()
            for rule in matching:
                print(
                    "- **{}** ({}): {}".format(
                        rule_value(rule, "name"),
                        rule_value(rule, "category"),
                        rule_value(rule, "description"),
                    )
                )
    print("---")


def rule_value(rule: Any, key: str) -> str:
    if not isinstance(rule, dict):
        return ""
    value = rule.get(key, "")
    return str(value) if value is not None else ""


if __name__ == "__main__":
    sys.exit(main())
