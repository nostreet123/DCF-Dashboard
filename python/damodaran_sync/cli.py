from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from damodaran_sync.convex_client import ConvexSyncClient


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="damodaran_sync")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("seed", help="Seed reference data in Convex")
    subparsers.add_parser("sync-current", help="Sync current datasets")
    subparsers.add_parser("sync-all", help="Sync all archived datasets")

    return parser


def _cmd_seed() -> int:
    client = ConvexSyncClient()
    client.upsert_seed()
    print("Seed completed")
    return 0


def _cmd_sync_current() -> int:
    print("sync-current is not implemented yet")
    return 1


def _cmd_sync_all() -> int:
    print("sync-all is not implemented yet")
    return 1


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "seed":
        return _cmd_seed()
    if args.command == "sync-current":
        return _cmd_sync_current()
    if args.command == "sync-all":
        return _cmd_sync_all()

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
