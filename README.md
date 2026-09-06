# MangaLens Translator

MangaLens Translator is an advanced, AI-powered web application designed to translate manga and comic pages seamlessly. Using Google's Gemini AI, it detects text bubbles, translates content, and attempts to reconstruct the image with translated text, providing a streamlined workflow for scanlation teams and enthusiasts.

## 🚀 Features

- **Text detection on the server**: a PaddleOCR detection model (ONNX, WebAssembly) finds every text line pixel-accurately; Gemini then reads, classifies and translates the numbered boxes, so the model never has to output coordinates. A local OCR worker can do the detection instead.
- **Server-side Typesetting**: Bubbles are cleaned and re-lettered on the server from an editable per-page layout document, with bundled Turkish-capable fonts, so results are identical for every viewer and can be corrected later.
- **Smart Editor**:
  - Visual editor with zoom, pan, and comparison tools.
  - "Translate All" batch processing with queue management.
  - Drag-and-drop image upload.
  - Reorder pages with ease.
- **Series Management**: Organize your projects into Series and Categories.
- **Secure Authentication**: Built-in credential-based authentication with secure password hashing (bcrypt).
- **Asset Storage**: S3-compatible storage support (MinIO included via Docker) for handling large image libraries.
- **Data Protection**: Full database and file backup/restore functionality (ZIP export/import).
- **Responsive Design**: Modern, glassmorphic UI built with Tailwind CSS 4.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Directory)
- **Language**: TypeScript
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/)
- **Database**: PostgreSQL
- **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
- **Authentication**: [NextAuth.js (v5)](https://authjs.dev/)
- **State Management**: [Zustand](https://zustand-demo.pmnd.rs/) + [TanStack Query](https://tanstack.com/query/latest)
- **AI Model**: Google Gemini (via `@google/genai`)
- **Storage**: AWS SDK (S3 compatible)

## ⚙️ Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local Database and Object Storage)
- Google Gemini API Key

## 📦 Installation

1. **Clone the repository**
2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env.local` file in the root directory and configure the following variables:

   ```env
    # PostgreSQL
    POSTGRES_USER=postgres
    POSTGRES_PASSWORD=postgres
    POSTGRES_DB=mangalens

    # MinIO
    MINIO_ROOT_USER=minioadmin
    MINIO_ROOT_PASSWORD=minioadmin
    MINIO_BUCKET_NAME=mangalens

    # Next.js (backend usage)
    DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mangalens
    MINIO_ENDPOINT=http://localhost:9000

    NEXT_PUBLIC_GEMINI_API_KEY=
    AUTH_SECRET="your-secret-key"

    # Optional: enables the outbound local OCR worker for verified-adult series.
    # Generate with: openssl rand -hex 32
    LOCAL_OCR_WORKER_TOKEN=
   ```

4. **Start Infrastructure (DB & MinIO)**

   ```bash
   docker-compose up -d
   ```

5. **Initialize Database**
   Push the schema to your PostgreSQL database:

   ```bash
   npm run drizzle-push
   ```

6. **Seed Admin User**
   Create the initial admin account:
   ```bash
   npx tsx scripts/seed.ts
   ```

## 🏃‍♂️ Running the Application

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Text Detection Model

`models/ppocr-v4-det.onnx` (PaddleOCR PP-OCRv4 mobile detector, Apache-2.0)
runs through `onnxruntime-web` on the server. Detection takes well under a
second per page and costs nothing. If the model or runtime is unavailable the
pipeline falls back to Gemini's own boxes, which are far less accurate on real
scans. `scripts/pipeline-preview.ts --debug` writes the numbered overlay that
Gemini reads next to the output image.

## Translation Jobs

Every translation request becomes a row in `page_jobs` (stages: queued,
detecting, translating, rendering, completed, failed, cancelled) whichever
provider performs detection: interactive Gemini, Gemini Batch or the local OCR
worker. Interactive jobs are executed by an in-process runner (two at a time,
rate-limit retries on the server) that also resumes queued jobs after a
restart, so "Translate All" keeps running when the browser tab is closed. The
UI polls `GET /api/jobs?seriesId=` and can cancel a job with
`POST /api/jobs/:id/cancel`. The runner is started from
`src/instrumentation.ts`; it requires a long-running Node server (`next start`),
not a serverless deployment.

## Migrating Old Pages

Pages translated before the layout system keep their flattened render
(`layout_version = 1`) and their old bubble data. The editor header shows a
"Taşıma" button for series that still have such pages. From there:

- **Tümünü taşı** re-typesets every old page from its stored bubbles on the
  server. No model call, no cost. The old render is kept aside.
- **Gemini ile yeniden tespit** runs the full pipeline for pages whose old
  boxes are poor or that have no bubble data (costs tokens).
- The review panel compares old and new renders page by page; each page can be
  reverted, opened in the editor, or accepted (old file deleted). "Eski
  render'ları sil" drops all kept old files of the series at once.

For large libraries the same free migration runs from the command line:

```bash
npx tsx scripts/migrate-legacy.ts --series all --dry-run
npx tsx scripts/migrate-legacy.ts --series <seriesId> --concurrency 2
```

## Page Layout Editor

Every translated page stores an editable layout document (regions, masks,
text, styles). Open it from an image card's pen button or the reader's
"Düzenle" button: move and resize text areas and source boxes, edit text,
change fonts and cleaning masks, re-translate single regions, preview on the
server and apply. Manual edits can be locked so automatic re-translation keeps
them.

For development without a database, `/dev/layout-editor` drives the same
canvas and inspector from URLs (disabled in production builds):

```
/dev/layout-editor?image=http://localhost:4177/page.jpg&bubbles=http://localhost:4177/page.bubbles.json
```

`scripts/fixtures/make-test-page.mjs` generates a synthetic page and its
legacy bubbles for this purpose.

## Local OCR Worker

When Gemini returns an adjustable sexually-explicit safety block for a series
explicitly marked `adult_verified`, a Mac can perform OCR without exposing a
local port. The worker polls this server over outbound HTTPS and returns only
the detected text regions. The server then runs the same text translation,
bubble cleaning and typesetting pipeline that Gemini Vision pages go through.

See [local-worker/README.md](local-worker/README.md) for installation and token
configuration. The fallback remains disabled when `LOCAL_OCR_WORKER_TOKEN` is
unset, for standard series, and for `OTHER` or `PROHIBITED_CONTENT` blocks.

### Default Login Credentials

- **Email**: `admin@example.com`
- **Password**: `password`

> **Note**: Upon first login, the system will automatically hash this legacy plaintext password for security.

## 🐳 Docker Deployment

You can also run the entire application stack using Docker. Ensure your `docker-compose.yml` is configured to build the app image.

```bash
docker-compose up --build
```

## 🛡️ License

This project is licensed under the MIT License.
