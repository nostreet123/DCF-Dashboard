interface ComputeTimeoutRef {
  current: ReturnType<typeof setTimeout> | null;
}

interface ApplyAssumptionChangeOptions<K extends string> {
  key: K;
  value: number;
  setIsComputing: (isComputing: boolean) => void;
  updateAssumption: (key: K, value: number) => void;
  settleDelayMs?: number;
}

export function clearComputeTimeout(timeoutRef: ComputeTimeoutRef): void {
  if (!timeoutRef.current) {
    return;
  }
  clearTimeout(timeoutRef.current);
  timeoutRef.current = null;
}

export function applyAssumptionChange<K extends string>(
  timeoutRef: ComputeTimeoutRef,
  {
    key,
    value,
    setIsComputing,
    updateAssumption,
    settleDelayMs = 520,
  }: ApplyAssumptionChangeOptions<K>,
): void {
  setIsComputing(true);
  clearComputeTimeout(timeoutRef);
  timeoutRef.current = setTimeout(() => {
    setIsComputing(false);
    timeoutRef.current = null;
  }, settleDelayMs);
  updateAssumption(key, value);
}
