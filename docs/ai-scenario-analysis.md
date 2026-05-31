# AI Scenario Analysis

AI scenario analysis is server-only. It runs through the `POST /api/ai/scenario-analysis` route, uses server-side configuration, and never exposes provider secrets to the browser. The route returns strict, schema-validated assumptions and rationale, and rejects malformed provider output.

## Configuration

The provider is configured through `HUGGING_FACE_*` environment variables. The full list with defaults lives in [`.env.example`](../.env.example); the most relevant ones:

| Variable | Purpose |
|---|---|
| `HUGGING_FACE_API_KEY` | Server-only provider credential. Never exposed to the browser. |
| `HUGGING_FACE_MODEL` | Model id, e.g. `deepseek-ai/DeepSeek-V4-Pro:fastest`. |
| `HUGGING_FACE_REASONING_EFFORT` | Reasoning budget (e.g. `xhigh` for maximum-reasoning demos). |
| `HUGGING_FACE_RESPONSE_FORMAT` | Response format, e.g. `json_object`. |
| `HUGGING_FACE_MAX_INPUT_BYTES` | Upper bound on request context size. |
| `HUGGING_FACE_MAX_OUTPUT_TOKENS` | Upper bound on generated tokens. |
| `HUGGING_FACE_PROVIDER_TIMEOUT_MS` | Per-attempt timeout that bounds slow provider attempts. |

### Maximum-reasoning DeepSeek demo

For a maximum-reasoning DeepSeek demo, set:

```bash
HUGGING_FACE_MODEL=deepseek-ai/DeepSeek-V4-Pro:fastest
HUGGING_FACE_REASONING_EFFORT=xhigh
HUGGING_FACE_RESPONSE_FORMAT=json_object
HUGGING_FACE_MAX_INPUT_BYTES=4000000
HUGGING_FACE_MAX_OUTPUT_TOKENS=8192
HUGGING_FACE_PROVIDER_TIMEOUT_MS=90000
```

This lets the app pass a 384K-token-scale context budget while bounding slow provider attempts. The `:fastest` suffix is a Hugging Face router provider-selection policy on the model id, not part of the JSON schema.

## Public-Demo Cost Controls

Public demos can cap AI usage and allow an authenticated bypass:

- `API_RATE_LIMIT_AI_SCENARIO_PER_MINUTE` and `API_RATE_LIMIT_AI_SCENARIO_DAILY` set per-IP/daily caps.
- `DCF_DEMO_ADMIN_TOKEN_SHA256` enables an optional admin bypass. It stores only a SHA-256 digest of your admin token, never the raw token.
