# FrameTrace validation notes

> This file is a historical local validation snapshot, not an accuracy benchmark, security audit, or hosted CI result. Run the commands in [`README.md`](../README.md#validation-commands) for a fresh check. It contains no user media, credentials, or database export.

## Executive summary

The frontend production build, Compose configuration, API health, authentication, PostgreSQL-backed history, and a persisted completed analysis were exercised in the original local validation pass. The image/video acceptance flow was not fully rerun in that pass because building the CPU PyTorch/OpenCV backend image was slow in the available Docker network environment.

## Functional checks

| Feature | Check | Historical result | Notes |
| --- | --- | --- | --- |
| Compose configuration | `docker compose config` | PASS | Compose file rendered successfully |
| Frontend build | `npm run build` | PASS | TypeScript/Vite production build completed |
| API health | `GET /api/health` | PASS | Database and model version returned |
| Authentication | Register/login flow | PASS | Session token issued |
| History | `GET /api/analyses` | PASS | Authenticated history returned |
| Completed analysis | Persisted report inspection | PASS | Terminal report contained model version, score, confidence, category, and structured result |
| Model versioning | Report inspection | PASS | `frametrace-baseline-0.1` was persisted |
| Fresh image upload | Multipart upload | PARTIAL | Route is implemented; fresh Docker run was blocked by backend image startup time |
| Video sampling | Sampled-frame workflow | PARTIAL | Implemented in `backend/app/analysis.py`; live run remained pending backend startup |

## Security-oriented checks

| Check | Historical result | Evidence |
| --- | --- | --- |
| Authenticated history | PASS | Private history requires a bearer token |
| Unsupported media | IMPLEMENTED | Extension and MIME validation returns a structured 422 response |
| Oversized upload | IMPLEMENTED | 100 MB client/server byte checks |
| Path traversal | PASS by design review | Storage names are UUID-generated; the user path is not used |
| Probabilistic language | PASS | Report and UI disclaimers warn against proof claims |

These checks describe the local demo posture. They do not replace dependency review, deployment hardening, penetration testing, or a privacy/retention policy for a service handling sensitive media. See [`SECURITY.md`](../SECURITY.md).

## Coverage and remaining work

- Backend unit tests cover deterministic model behavior, supported media classification, and probabilistic report language.
- The frontend production build checks TypeScript/Vite compilation; browser-level drag/drop and video interaction still need a live end-to-end check.
- The bounded video path samples at most 12 evenly spaced frames and rejects duration over 15 minutes.
- The demo uses an in-process background task rather than a durable worker queue.
- Video frame thumbnails are not generated as persistent preview assets.
- No labeled dataset or trained checkpoint is included, so no accuracy, precision, recall, F1, or calibration numbers are claimed.

## Historical bug fix

The initial registration model omitted `display_name`, which caused a registration error. The field and a safe PostgreSQL startup migration were added; the original registration/login validation then succeeded.
