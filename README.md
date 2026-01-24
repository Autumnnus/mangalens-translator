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
   # Database
   DATABASE_URL="postgres://user:password@localhost:5432/mangalens"

   # NextAuth
   AUTH_SECRET="your-super-secret-key-at-least-32-chars"
   AUTH_URL="http://localhost:3000"

   # Object Storage (MinIO)
   S3_ENDPOINT="http://localhost:9000"
   S3_REGION="us-east-1"
   S3_ACCESS_KEY="minioadmin"
   S3_SECRET_KEY="minioadmin"
   S3_BUCKET="mangalens-images"
   S3_PUBLIC_URL="http://localhost:9000/mangalens-images"

   # Gemini AI
   NEXT_PUBLIC_GEMINI_API_KEY="your-gemini-api-key"
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
