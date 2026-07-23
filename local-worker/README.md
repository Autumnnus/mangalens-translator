# MangaLens Local OCR Worker

This worker uses the Mac's CPU for OCR while the production server only stores
and coordinates jobs. It initiates every connection outbound over HTTPS; no
router port, public localhost service, static IP, or tunnel is required.

The worker receives jobs only after Gemini reports an adjustable sexually
explicit safety block and the series owner has explicitly marked the series as
`adult_verified`. `OTHER`, `PROHIBITED_CONTENT`, and standard/age-ambiguous
series are never routed automatically.

## 1. Production configuration

Generate one strong token:

```bash
openssl rand -hex 32
```

Set the result as `LOCAL_OCR_WORKER_TOKEN` in the production server environment
and deploy the application plus its database migration. Do not expose or commit
this token.

## 2. Mac installation

Python 3.11 or 3.12 is recommended.

```bash
bash local-worker/setup-macos.sh
cp local-worker/.env.example local-worker/.env
```

Edit `local-worker/.env`:

- `MANGALENS_SERVER_URL`: production HTTPS origin, without a trailing slash.
- `MANGALENS_WORKER_TOKEN`: exactly the production token.
- `MANGALENS_WORKER_ID`: a name for this Mac.
- `MANGALENS_MANGA_OCR=1`: improves Japanese manga recognition; set `0` to use
  PaddleOCR only and reduce memory/model loading.

Then run:

```bash
bash local-worker/run-macos.sh
```

For local development, a separate `local-worker/.env` is optional. If it is
absent, `run-macos.sh` reads the project's `.env.local`, maps
`LOCAL_OCR_WORKER_TOKEN` to the worker token, and connects to
`http://localhost:3000` automatically.

The first run downloads OCR models. The worker can be stopped at any time; jobs
remain queued and are resumed when it starts again.

## Operational notes

- Keep the production URL on HTTPS. Plain HTTP is accepted only for localhost.
- The raw page is held in memory and is not written to disk by the worker.
- Do not log response bodies or OCR text in production.
- Revoke access by changing `LOCAL_OCR_WORKER_TOKEN` on the server.
- The server never initiates a connection to the Mac.
