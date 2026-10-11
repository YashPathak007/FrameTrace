# FrameTrace: portfolio project story

## One-line summary

FrameTrace is a full-stack media evidence workspace that turns an image or sampled video into a traceable, inspectable review instead of an overconfident authenticity verdict.

## Recruiter-ready narrative

I built FrameTrace around a product constraint that matters for uncertain ML systems: the interface must not claim more than the evidence supports. A user can register, upload a still image or video, watch a real persisted job move from `QUEUED` to a terminal state, and revisit a report containing the model output, measured visual signals, metadata context, sampled video findings, and limitations.

The implementation spans a React/Vite frontend, a FastAPI API, PostgreSQL persistence, OpenCV media processing, and a transparent PyTorch baseline. The backend validates media, scopes records to the authenticated owner, uses generated storage names, bounds video work, and persists structured findings. The frontend turns those contracts into a guided workflow with explicit loading and failure states, live status polling, searchable history, and repeated reminders that a score is not proof.

The model is intentionally modest: `frametrace-baseline-0.1` is a deterministic `Linear + Sigmoid` research baseline over five normalized measurements. It is not a trained or calibrated detector, and the repository makes no accuracy claim because it ships no labeled evaluation dataset. That limitation is part of the project story, not a footnote: before a future model could be presented as a detector, it would need a licensed dataset, documented splits and preprocessing, calibration, evaluation, failure analysis, and a deployment policy for high-impact decisions.

## Engineering decisions worth discussing

- **Evidence over verdicts:** model output, measured findings, metadata, and interpretation are separate report sections.
- **Real async state:** the UI polls persisted API state and shows failure rather than manufacturing progress or a score.
- **Bounded processing:** uploads are size-limited; video duration and sampled frames are capped for predictable demo behavior.
- **Replaceable model seam:** the baseline has a versioned interface so a validated model can be introduced without rewriting the report contract.
- **Honest deployment boundary:** the in-process background task is suitable for a portfolio demo, while the architecture documents the durable-worker/object-storage path for production.

## What I would build next

1. Add a durable worker and idempotent job/retry semantics.
2. Move media to managed object storage with retention, deletion, and access-audit controls.
3. Define and license a representative labeled dataset, then publish a reproducible evaluation and calibration report.
4. Add end-to-end upload/video fixtures, browser checks, rate limiting, and operational telemetry.
5. Revisit report language and thresholds with domain experts before considering any consequential use.

## Short portfolio blurb

> **FrameTrace** — Built a React/FastAPI/PostgreSQL media evidence workspace with OpenCV analysis and a transparent PyTorch research baseline. Implemented authenticated uploads, bounded video sampling, persisted job states, structured forensic findings, live report polling, searchable history, and an uncertainty-first UX that explicitly separates model signals from proof claims.
