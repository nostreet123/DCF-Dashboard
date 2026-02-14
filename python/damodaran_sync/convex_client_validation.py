from __future__ import annotations

from typing import Any, Callable


LogInvalidFn = Callable[[str, Any], None]


def expect_dict(operation: str, result: Any, log_invalid: LogInvalidFn) -> dict[str, Any]:
    if not isinstance(result, dict):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    return result


def expect_list(operation: str, result: Any, log_invalid: LogInvalidFn) -> list[Any]:
    if not isinstance(result, list):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    return result


def expect_optional_dict(
    operation: str,
    result: Any,
    log_invalid: LogInvalidFn,
) -> dict[str, Any] | None:
    if result is None:
        return None
    return expect_dict(operation, result, log_invalid)


def expect_str(operation: str, result: Any, log_invalid: LogInvalidFn) -> str:
    if not isinstance(result, str):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    return result


def expect_int_field(
    operation: str,
    result: dict[str, Any],
    key: str,
    log_invalid: LogInvalidFn,
    *,
    default: int = 0,
) -> int:
    value = result.get(key, default)
    if isinstance(value, float):
        if not value.is_integer():
            log_invalid(operation, result)
            raise ValueError(f"Unexpected {operation} response: {result!r}")
        value = int(value)
    if not isinstance(value, int):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    return value


def expect_optional_str_field(
    operation: str,
    result: dict[str, Any],
    key: str,
    log_invalid: LogInvalidFn,
) -> str | None:
    value = result.get(key)
    if value is not None and not isinstance(value, str):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    return value


def parse_seen_snapshots(
    operation: str,
    result: dict[str, Any],
    log_invalid: LogInvalidFn,
) -> list[tuple[str, str]]:
    seen_snapshots = result.get("seenSnapshots", [])
    if not isinstance(seen_snapshots, list):
        log_invalid(operation, result)
        raise ValueError(f"Unexpected {operation} response: {result!r}")
    parsed: list[tuple[str, str]] = []
    for entry in seen_snapshots:
        if not isinstance(entry, dict):
            log_invalid(operation, result)
            raise ValueError(f"Unexpected {operation} response: {result!r}")
        snapshot_id = entry.get("snapshotId")
        build_id = entry.get("buildId")
        if not isinstance(snapshot_id, str) or not isinstance(build_id, str):
            log_invalid(operation, result)
            raise ValueError(f"Unexpected {operation} response: {result!r}")
        parsed.append((snapshot_id, build_id))
    return parsed
