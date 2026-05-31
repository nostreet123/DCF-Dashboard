# Third-Party Notices

DCF Dashboard is licensed under the [MIT License](LICENSE). This file summarizes **direct** runtime dependencies that ship with or power the default local experience. Dev-only tools (ESLint, Playwright, pytest, and similar) are omitted unless they affect distributed artifacts.

For the full dependency graph and exact versions, use:

- JavaScript: `package-lock.json` and `npm ci`
- Python: `python/requirements.txt`, `python/constraints.txt`

## Application license

| Component | License | Notes |
|-----------|---------|--------|
| DCF Dashboard (this repository) | MIT | See [LICENSE](LICENSE) |

## JavaScript runtime dependencies (npm)

| Package | License | Role |
|---------|---------|------|
| [Next.js](https://www.npmjs.com/package/next) | MIT | Web framework and API routes |
| [React](https://www.npmjs.com/package/react) | MIT | UI |
| [react-dom](https://www.npmjs.com/package/react-dom) | MIT | UI rendering |
| [Convex](https://www.npmjs.com/package/convex) | Apache-2.0 | Optional persistence client |
| [clsx](https://www.npmjs.com/package/clsx) | MIT | CSS class utilities |
| [@radix-ui/react-icons](https://www.npmjs.com/package/@radix-ui/react-icons) | MIT | Icons |

## Python runtime dependencies

| Package | License | Role |
|---------|---------|------|
| [FastAPI](https://pypi.org/project/fastapi/) | MIT | DCF engine HTTP service |
| [Uvicorn](https://pypi.org/project/uvicorn/) | BSD-3-Clause | ASGI server |
| [Pydantic](https://pypi.org/project/pydantic/) | MIT | Request/response models |
| [NumPy](https://pypi.org/project/numpy/) | BSD-3-Clause | Numerics |
| [pandas](https://pypi.org/project/pandas/) | BSD-3-Clause | Data frames |
| [httpx](https://pypi.org/project/httpx/) | BSD-3-Clause | HTTP client |
| [requests](https://pypi.org/project/requests/) | Apache-2.0 | HTTP client (sync paths) |
| [beautifulsoup4](https://pypi.org/project/beautifulsoup4/) | MIT | HTML parsing |
| [lxml](https://pypi.org/project/lxml/) | BSD-3-Clause | XML/HTML parsing |
| [openpyxl](https://pypi.org/project/openpyxl/) | MIT | Excel read |
| [xlrd](https://pypi.org/project/xlrd/) | BSD-3-Clause | Legacy Excel read |
| [defusedxml](https://pypi.org/project/defusedxml/) | Python Software Foundation License | Safer XML |
| [pypdf](https://pypi.org/project/pypdf/) | BSD-3-Clause | PDF read |
| [PyYAML](https://pypi.org/project/PyYAML/) | MIT | YAML |
| [tenacity](https://pypi.org/project/tenacity/) | Apache-2.0 | Retries |
| [python-dotenv](https://pypi.org/project/python-dotenv/) | BSD-3-Clause | Env loading |
| [convex](https://pypi.org/project/convex/) (Python) | Apache-2.0 | Optional sync client |

## External data and services (not bundled)

Using live modes may call third-party services under **their** terms:

| Service | Use in project | Terms |
|---------|----------------|-------|
| SEC EDGAR | Company facts and filings | [SEC.gov privacy/terms](https://www.sec.gov/privacy) — requires a descriptive `SEC_USER_AGENT` |
| Damodaran datasets | Optional sync inputs | Professor Damodaran’s site terms |
| Hugging Face | Optional AI scenario analysis | [HF terms](https://huggingface.co/terms) when `HUGGINGFACE_API_KEY` is set |
| Convex Cloud | Optional persistence | [Convex terms](https://www.convex.dev/terms) when deployed |

## Attribution

If you redistribute binaries or Docker images built from this repo, include this file and the MIT `LICENSE` alongside your distribution. Update this file when adding new **direct** runtime dependencies with non-MIT licenses.
