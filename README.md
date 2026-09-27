# MangaLens Translator

MangaLens Translator is an advanced, AI-powered web application designed to translate manga and comic pages seamlessly. A pixel text detector finds the lettering, a vision model of your choice reads it, a text model translates it and the server re-letters the page, providing a streamlined workflow for scanlation teams and enthusiasts.

## 🚀 Features

- **Text detection on the server**: a PaddleOCR detection model (ONNX, WebAssembly) finds every text line pixel-accurately. Models never output coordinates: the reader gets each block as its own close-up crop and only transcribes it.
- **Any AI provider**: Google Gemini natively, and any OpenAI-compatible API (OpenAI, OpenRouter, DeepSeek, Zhipu GLM, Alibaba Qwen, local servers). Reading and translation can use different models; keys rotate on rate limits.
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
- **AI**: provider-neutral layer (`src/server/llm`), Gemini via `@google/genai`, others over the OpenAI chat completions API
- **Storage**: AWS SDK (S3 compatible)

## ⚙️ Prerequisites

- Node.js 20+
- Docker & Docker Compose (for local Database and Object Storage)
- An API key for at least one AI provider (a vision model is needed for reading)

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

    # Optional server-wide Gemini key, used until a user adds providers in Settings.
    GEMINI_API_KEY=
    AUTH_SECRET="your-secret-key"
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
second per page and costs nothing. `scripts/pipeline-preview.ts --debug`
writes the numbered overlay the reader sees next to the output image; the
script runs the whole pipeline on a local file without the database and works
with any provider (`--provider openai --base-url … --model …`).

## Rendering guarantees

- Balloon interiors are found from the pixels and painted with their own
  colour; text with no closed container gets a painted bubble behind it.
- After cleaning, any glyph-sized ink left on the cleaned surface is painted
  over, so no source lettering stays visible.
- A translation that does not fit shrinks to 75% of the minimum size; if it
  still does not fit, a clean backing is painted behind it. Text is never
  drawn over artwork.

## Translation Jobs

Every translation request becomes a row in `page_jobs` (stages: queued,
detecting, translating, rendering, completed, failed, cancelled). Jobs are
executed by an in-process runner (two at a time, rate-limit retries and key
rotation on the server) that also resumes queued jobs after a
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
- **Translate again** runs the full pipeline for pages whose old
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

## Old data

Nothing is dropped. Pages translated earlier keep their stored render and
layout and display as before; they only change when translated again.
Accounts that only had Gemini keys are mapped onto a Gemini provider
automatically. The `local_ocr_jobs` and `translation_jobs` tables stay in the
database as history; jobs of those removed paths that were still running are
cancelled on start-up and their pages keep their previous translation.

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
