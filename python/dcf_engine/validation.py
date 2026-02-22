from __future__ import annotations


def ensure_list_length(
    name: str,
    values: list[float] | None,
    periods: int,
    *,
    required_message: str = "{name} is required",
) -> list[float]:
    if values is None:
        raise ValueError(required_message.format(name=name))
    if len(values) != periods:
        raise ValueError(f"{name} must have {periods} values")
    return values


def ensure_positive(value: float, *, message: str) -> None:
    if value <= 0:
        raise ValueError(message)
