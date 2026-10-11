# Interviewer demo

This walkthrough is designed for a five-minute local demo. It shows the product flow and the engineering decisions behind it without implying that the bundled baseline is a validated media-manipulation detector.

## 1. Start the stack

From the repository root:

```powershell
Copy-Item .env.example .env
# Edit .env and replace SECRET_KEY with a long random value.
docker compose up --build
```

Open <http://localhost:5175>. The first build downloads the CPU PyTorch/OpenCV dependencies and may take a while. The API is available at <http://localhost:4100/api>.

## 2. Register a local analyst

1. Choose **Create an account**.
2. Use a display name, email, and password of at least 10 characters.
3. Point out the **BASELINE MODEL / 0.1 / RESEARCH** label and the disclaimer before uploading media.

There is no shared demo account or preloaded sample data. Use a non-sensitive image or short video file you own; no media fixtures are committed.

## 3. Run an image review

1. Choose **New review**.
2. Drop a JPG, PNG, or WEBP file, or browse for one.
3. Explain that the client checks the extension and 100 MB limit before the API repeats server-side validation.
4. Start the review. The report opens while the job is `QUEUED` or `PROCESSING` and polls the actual API state.
5. When complete, walk through:
   - the model score and version;
   - JPEG recompression, noise, and texture measurements;
   - metadata findings;
   - processing context and the explicit limitations panel.

Useful talking point: the UI intentionally does not show a made-up percentage for background progress. A terminal result is either returned by the backend or the report shows a failure.

## 4. Run a video review

1. Return to **New review** and select a short MP4, MOV, AVI, or MKV.
2. The backend reads container metadata and samples at most 12 evenly spaced frames, bounded by the 15-minute duration limit.
3. Show the **Sampled frame findings** table with frame indices, timestamps, and per-frame model scores.
4. Clarify that sampling is a compact review aid, not frame-by-frame coverage or a proof of editing.

## 5. Revisit the evidence trail

1. Open **History**.
2. Search by filename or filter by `Completed`, `Processing`, `Queued`, or `Failed`.
3. Reopen a report and compare the model output with the individual measurements and source context.

## 6. Technical discussion prompts

- **Why a baseline?** The fixed-coefficient `Linear + Sigmoid` model is transparent and reproducible, which makes the report contract easy to inspect before introducing a trained checkpoint.
- **Why separate signals from score?** Recompression, noise, texture, metadata, and platform processing are contextual indicators. Collapsing them into a verdict would overstate what the data supports.
- **Why bounded sampling?** It keeps the demo's cost and latency predictable while making the trade-off visible in the report.
- **What is production work?** Replace the in-process background task with a durable worker, move media to managed object storage with retention controls, add rate limiting/observability, and evaluate a trained model on a licensed labeled dataset before making accuracy claims.
- **What should this never decide?** Legal, employment, safety, access-control, or other high-impact decisions.

## Reset local demo state

To stop the containers without deleting named volumes:

```powershell
docker compose down
```

To intentionally reset the local database and uploaded demo media:

```powershell
docker compose down --volumes
```

Never commit `.env`, uploaded media, database files/volumes, model weights, or generated build output. See [`SECURITY.md`](SECURITY.md) for the local privacy boundary.
