from __future__ import annotations

import time
from contextlib import contextmanager
from dataclasses import dataclass, field


@dataclass
class TimingSummary:
    stages_ms: dict[str, float] = field(default_factory=dict)
    counters: dict[str, int] = field(default_factory=dict)

    def add_ms(self, stage: str, delta_ms: float) -> None:
        self.stages_ms[stage] = self.stages_ms.get(stage, 0.0) + delta_ms

    def inc(self, counter: str, delta: int = 1) -> None:
        self.counters[counter] = self.counters.get(counter, 0) + delta

    def report(self) -> str:
        total_ms = sum(self.stages_ms.values())
        lines: list[str] = []
        lines.append("Timing summary:")
        if not self.stages_ms:
            lines.append("- (no timings recorded)")
            return "\n".join(lines)

        ordered = sorted(self.stages_ms.items(), key=lambda kv: kv[1], reverse=True)
        for stage, ms in ordered:
            pct = (ms / total_ms * 100.0) if total_ms else 0.0
            lines.append(f"- {stage}: {ms/1000:.2f}s ({pct:.1f}%)")

        if self.counters:
            lines.append("Counters:")
            for key, value in sorted(self.counters.items()):
                lines.append(f"- {key}: {value}")
        return "\n".join(lines)


@contextmanager
def maybe_time(timing: TimingSummary | None, stage: str):
    if timing is None:
        yield
        return
    start = time.perf_counter()
    try:
        yield
    finally:
        timing.add_ms(stage, (time.perf_counter() - start) * 1000.0)
