from __future__ import annotations

import argparse
import sys

from dotenv import load_dotenv

from damodaran_sync import discover, mapping_resolver, sync
from damodaran_sync.convex_client import ConvexSyncClient
from damodaran_sync.dataset_mappings import (
    SEED_CATEGORIES,
    SEED_DATASETS,
    SEED_DATASET_MAPPINGS,
    SEED_REGIONS,
)
from damodaran_sync.dataset_mappings_validation import validate_seed_integrity


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="damodaran_sync")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("seed", help="Seed reference data in Convex")
    sync_current = subparsers.add_parser("sync-current", help="Sync current datasets")
    sync_current.add_argument(
        "--force-rebuild",
        action="store_true",
        help="Rebuild snapshots even if file hashes are unchanged.",
    )
    sync_current.add_argument(
        "--head-precheck",
        action="store_true",
        default=None,
        help="Use HEAD with conditional headers to skip unchanged downloads.",
    )
    sync_all = subparsers.add_parser("sync-all", help="Sync all archived datasets")
    sync_all.add_argument(
        "--force-rebuild",
        action="store_true",
        help="Rebuild snapshots even if file hashes are unchanged.",
    )
    sync_all.add_argument(
        "--head-precheck",
        action="store_true",
        default=None,
        help="Use HEAD with conditional headers to skip unchanged downloads.",
    )

    subparsers.add_parser(
        "status-primarykeynorm",
        help="Check whether current datasets are missing primaryKeyNorm rows.",
    )
    cleanup_parser = subparsers.add_parser(
        "cleanup-nonactive-tabledata",
        help="Delete tableData rows for non-active builds.",
    )
    cleanup_parser.add_argument(
        "--snapshot-id",
        help="Optional snapshot id to clean (skips discovery).",
    )
    cleanup_parser.add_argument(
        "--build-id",
        help="Optional build id to delete directly (requires --snapshot-id).",
    )
    backfill_parser = subparsers.add_parser(
        "backfill-primarykeynorm",
        help="Backfill primaryKeyNorm for a snapshot/build.",
    )
    backfill_parser.add_argument(
        "--snapshot-id",
        required=True,
        help="Snapshot id to backfill.",
    )
    backfill_parser.add_argument(
        "--build-id",
        required=True,
        help="Build id to backfill.",
    )
    backfill_all_parser = subparsers.add_parser(
        "backfill-primarykeynorm-all",
        help="Backfill primaryKeyNorm for all tableData rows missing the field.",
    )
    backfill_all_parser.add_argument(
        "--limit",
        type=int,
        default=500,
        help="Pagination size for each backfill pass.",
    )
    subparsers.add_parser(
        "validate-mappings",
        help="Validate dataset/region/mapping seed integrity.",
    )

    return parser


def _cmd_seed() -> int:
    client = ConvexSyncClient()
    client.upsert_seed()
    print("Seed completed")
    return 0


def _cmd_sync_current(force_rebuild: bool, head_precheck: bool | None) -> int:
    client = ConvexSyncClient()
    sync.process_page(
        discover.CURRENT_PAGE_URL,
        "current",
        client,
        force_rebuild,
        head_precheck=head_precheck,
    )
    return 0


def _cmd_sync_all(force_rebuild: bool, head_precheck: bool | None) -> int:
    client = ConvexSyncClient()
    sync.process_page(
        discover.ARCHIVE_PAGE_URL,
        "archive",
        client,
        force_rebuild,
        head_precheck=head_precheck,
    )
    return 0


def _cmd_status_primarykeynorm() -> int:
    client = ConvexSyncClient()
    refs = client.get_reference()
    regions_list = refs["regions"]
    datasets_list = refs["datasets"]
    mappings_list = refs["datasetMappings"]
    datasets_map = {d["key"].lower(): d for d in datasets_list}

    discovery = discover.discover_page_assets(
        discover.CURRENT_PAGE_URL,
        "current",
    )

    missing = []
    complete = []
    for asset in discovery.assets:
        if not asset.as_of_date:
            continue

        stem = mapping_resolver.normalize_stem(asset.file_name)
        dataset_key, resolved_ds = mapping_resolver.resolve_dataset_key(
            stem, mappings_list
        )
        region_code, _ = mapping_resolver.resolve_region_code(
            stem,
            asset.link_label,
            dataset_key,
            datasets_map,
            regions_list,
        )

        snapshot = client.get_snapshot_by_identity(
            dataset_key,
            region_code,
            asset.as_of_date,
        )
        if not snapshot or not snapshot.get("activeBuildId"):
            missing.append((dataset_key, region_code, asset.as_of_date))
            continue

        if snapshot.get("primaryKeyNormComplete") is True:
            complete.append((dataset_key, region_code, asset.as_of_date))
        else:
            missing.append((dataset_key, region_code, asset.as_of_date))

    print(f"primaryKeyNorm complete snapshots: {len(complete)}")
    print(f"primaryKeyNorm missing snapshots: {len(missing)}")
    for dataset_key, region_code, as_of_date in missing:
        print(f"- {dataset_key}/{region_code} {as_of_date}")

    return 0


def _cmd_cleanup_nonactive_tabledata(
    snapshot_id: str | None, build_id: str | None
) -> int:
    client = ConvexSyncClient()
    if snapshot_id:
        if build_id:
            snapshot = client.get_snapshot_by_id(snapshot_id)
            if not snapshot:
                print(f"Snapshot not found: {snapshot_id}")
                return 1
            if snapshot.get("activeBuildId") == build_id:
                print(f"Refusing to delete active build {build_id} for {snapshot_id}")
                return 1
            total_deleted = 0
            while True:
                deleted = client.delete_rows(snapshot_id, build_id, 1000)
                total_deleted += deleted
                if deleted == 0:
                    break
            print(f"Deleted {total_deleted} rows for build {build_id}.")
            return 0

        snapshot = client.get_snapshot_by_id(snapshot_id)
        if not snapshot:
            print(f"Snapshot not found: {snapshot_id}")
            return 1
        active_build_id = snapshot.get("activeBuildId")
        if not active_build_id:
            print(f"Snapshot has no activeBuildId: {snapshot_id}")
            return 1
        total_deleted = 0
        cursor = None
        while True:
            deleted, cursor = client.delete_non_active_rows_page(
                snapshot_id,
                active_build_id,
                cursor=cursor,
                limit=500,
            )
            total_deleted += deleted
            if not cursor:
                break
        print(f"Deleted {total_deleted} non-active tableData rows.")
        return 0

    discovery = discover.discover_page_assets(
        discover.CURRENT_PAGE_URL,
        "current",
    )
    refs = client.get_reference()
    regions_list = refs["regions"]
    datasets_list = refs["datasets"]
    mappings_list = refs["datasetMappings"]
    datasets_map = {d["key"].lower(): d for d in datasets_list}

    total_deleted = 0
    for asset in discovery.assets:
        if not asset.as_of_date:
            continue

        stem = mapping_resolver.normalize_stem(asset.file_name)
        dataset_key, _ = mapping_resolver.resolve_dataset_key(
            stem, mappings_list
        )
        region_code, _ = mapping_resolver.resolve_region_code(
            stem,
            asset.link_label,
            dataset_key,
            datasets_map,
            regions_list,
        )
        snapshot = client.get_snapshot_by_identity(
            dataset_key,
            region_code,
            asset.as_of_date,
        )
        if not snapshot or not snapshot.get("activeBuildId"):
            continue

        cursor = None
        while True:
            deleted, cursor = client.delete_non_active_rows_page(
                snapshot["_id"],
                snapshot["activeBuildId"],
                cursor=cursor,
                limit=500,
            )
            total_deleted += deleted
            if not cursor:
                break

    print(f"Deleted {total_deleted} non-active tableData rows.")
    return 0


def _cmd_backfill_primarykeynorm(snapshot_id: str, build_id: str) -> int:
    client = ConvexSyncClient()
    snapshot = client.get_snapshot_by_id(snapshot_id)
    if not snapshot:
        print(f"Snapshot not found: {snapshot_id}")
        return 1
    total_updated = 0
    cursor = None
    while True:
        updated, cursor = client.backfill_primary_key_norm_page(
            snapshot_id,
            build_id,
            cursor=cursor,
            limit=500,
        )
        total_updated += updated
        if not cursor:
            break
    print(f"Backfilled {total_updated} rows.")
    if snapshot.get("activeBuildId") == build_id:
        client.mark_primary_key_norm_complete(snapshot_id, build_id)
        print("Marked snapshot primaryKeyNormComplete.")
    else:
        print("Skipped marking primaryKeyNormComplete (build is not active).")
    return 0


def _cmd_backfill_primarykeynorm_all(limit: int) -> int:
    client = ConvexSyncClient()
    total_updated = 0
    cursor = None
    page = 0
    seen_pairs: set[tuple[str, str]] = set()
    while True:
        updated, cursor, seen = client.backfill_missing_primary_key_norm_page(
            cursor=cursor,
            limit=limit,
        )
        for snapshot_id, build_id in seen:
            seen_pairs.add((snapshot_id, build_id))
        page += 1
        total_updated += updated
        if page % 10 == 0 or updated:
            print(f"page {page}: updated {updated}, total {total_updated}")
        if not cursor:
            break
    print(f"Backfilled {total_updated} rows.")
    marked = 0
    for snapshot_id, build_id in seen_pairs:
        snapshot = client.get_snapshot_by_id(snapshot_id)
        if not snapshot or snapshot.get("activeBuildId") != build_id:
            continue
        client.mark_primary_key_norm_complete(snapshot_id, build_id)
        marked += 1
    if marked:
        print(f"Marked {marked} snapshots primaryKeyNormComplete.")
    return 0


def _cmd_validate_mappings() -> int:
    errors = validate_seed_integrity(
        categories=SEED_CATEGORIES,
        regions=SEED_REGIONS,
        datasets=SEED_DATASETS,
        mappings=SEED_DATASET_MAPPINGS,
    )
    if errors:
        print("Dataset mapping validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Dataset mapping validation passed.")
    return 0


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "seed":
        return _cmd_seed()
    if args.command == "sync-current":
        return _cmd_sync_current(args.force_rebuild, args.head_precheck)
    if args.command == "sync-all":
        return _cmd_sync_all(args.force_rebuild, args.head_precheck)
    if args.command == "status-primarykeynorm":
        return _cmd_status_primarykeynorm()
    if args.command == "cleanup-nonactive-tabledata":
        return _cmd_cleanup_nonactive_tabledata(args.snapshot_id, args.build_id)
    if args.command == "backfill-primarykeynorm":
        return _cmd_backfill_primarykeynorm(args.snapshot_id, args.build_id)
    if args.command == "backfill-primarykeynorm-all":
        return _cmd_backfill_primarykeynorm_all(args.limit)
    if args.command == "validate-mappings":
        return _cmd_validate_mappings()

    parser.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
