# MangaLens Translator

MangaLens Translator is an advanced, AI-powered web application designed to translate manga and comic pages seamlessly. Using Google's Gemini AI, it detects text bubbles, translates content, and attempts to reconstruct the image with translated text, providing a streamlined workflow for scanlation teams and enthusiasts.

## 🚀 Features

- **AI Translation**: Powered by Google Gemini AI to detect and translate text bubbles while preserving context.
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

## Local OCR Worker

When Gemini returns an adjustable sexually-explicit safety block for a series
explicitly marked `adult_verified`, a Mac can perform OCR without exposing a
local port. The worker polls this server over outbound HTTPS and returns only
the detected text regions; text-only translation and image rendering remain in
the existing application flow.

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
