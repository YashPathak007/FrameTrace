# Security and privacy notes

FrameTrace is a local portfolio/demo application. This document describes the safeguards that are visible in the code and the boundaries that still matter before any public deployment. It is not a production security certification.

## Current safeguards

- **Authentication:** registration and login are handled by FastAPI; passwords are stored as bcrypt hashes and sessions are signed JWTs with a two-hour expiry.
- **Authorization:** file, analysis, history, rename, and delete routes constrain records to the authenticated owner.
- **Upload validation:** accepted extensions and MIME families are checked, uploads are capped at 100 MB, images must decode with OpenCV, and supported image dimensions are bounded.
- **Generated storage names:** user-provided names are sanitized for display and are not used as storage paths; stored files use generated identifiers plus the validated extension.
- **Bounded video work:** video duration is limited to 15 minutes and analysis samples at most 12 evenly spaced frames.
- **Explicit job states:** the API persists `QUEUED`, `PROCESSING`, `COMPLETED`, or `FAILED` rather than fabricating a result for unfinished work.
- **Local-origin CORS:** the demo configuration allows the configured frontend origin rather than every origin.
- **Ignored runtime state:** local secrets, databases, uploads, caches, and build artifacts are covered by repository ignore rules.

## Threat model and boundaries

The safeguards are aimed at accidental misuse in a local demo: malformed uploads, path traversal through filenames, oversized media, cross-user record access, and confusing partial job results. They do not make an internet-facing service safe by themselves.

Before a deployment that handles real or sensitive media, address at least:

- Replace demo Compose credentials and development defaults with managed secrets and a rotation plan.
- Put the service behind HTTPS and an identity/session policy appropriate to the environment.
- Add rate limits, request/body timeouts, structured audit logs, monitoring, and alerting.
- Move background work from FastAPI's in-process task to a durable worker with retry and cancellation semantics.
- Move media to managed object storage with encryption, access controls, retention, deletion, and malware/content scanning policies.
- Add an explicit cleanup transaction for stored media when a review is deleted; the current delete route removes the analysis record but does not implement a complete media-retention policy.
- Review dependency updates, container hardening, database migrations, and error exposure before publishing an endpoint.

## Handling media locally

Do not upload private, regulated, or sensitive media to a shared machine or an unreviewed deployment. The Docker Compose setup persists PostgreSQL data and uploads in named local volumes so a normal `docker compose down` leaves demo state behind. Use `docker compose down --volumes` only when intentionally deleting that local state, and verify the host's Docker storage policy if the media was sensitive.

The repository intentionally contains no `.env` file, tokens, model weights, database volumes, uploaded media, or private sample data. Keep those artifacts outside commits and review the ignore rules before creating a public repository.

## Reporting a vulnerability

Please do not publish credentials, private media, exploit details, or a reproducible attack against a live deployment in a public issue. If the repository has GitHub private vulnerability reporting enabled, use a private Security Advisory. Otherwise, contact the project maintainer privately through the repository's configured contact channel and include a minimal description, affected component, impact, and safe reproduction guidance.
