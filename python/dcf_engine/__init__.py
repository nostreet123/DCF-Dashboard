"""Deterministic DCF engine (minimal skeleton)."""

__version__ = "0.1.0"

__all__ = ["DCFEngine", "InputAssumptions", "Trace", "ValuationResult", "__version__"]

_LAZY_EXPORTS = {
    "DCFEngine": ("dcf_engine.engine", "DCFEngine"),
    "InputAssumptions": ("dcf_engine.schema", "InputAssumptions"),
    "Trace": ("dcf_engine.schema", "Trace"),
    "ValuationResult": ("dcf_engine.schema", "ValuationResult"),
}


def __getattr__(name: str):
    if name in _LAZY_EXPORTS:
        module_name, attr_name = _LAZY_EXPORTS[name]
        module = __import__(module_name, fromlist=[attr_name])
        return getattr(module, attr_name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def __dir__() -> list[str]:
    return sorted(set(globals()) | set(__all__))
