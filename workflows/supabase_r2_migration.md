---
description: Migration to Supabase + Cloudflare R2 for Multi-Device Sync
---

# Supabase + Cloudflare R2 Integration Plan

This workflow describes the steps to migrate the local-only storage (IndexedDB) to a cloud-based solution using Supabase (Database) and Cloudflare R2 (Object Storage). This will enable multi-device synchronization and handling of large datasets (5GB+).

## Prerequisites

- [ ] Create a Supabase Account and Project (Free Tier).
- [ ] Create a Cloudflare Account and R2 Bucket (Free Tier - 10GB).
- [ ] Get API Keys:
  - Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Cloudflare R2: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ACCOUNT_ID`

## Step 1: Backend / API Setup (Next.js API Routes)

Directly accessing R2 from the client with long-lived keys is insecure. We will use Next.js API Routes / Server Actions to handle signed URLs or proxy uploads.

1.  **Install SDKs**:
    ```bash
    npm install @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
    ```
2.  **Configure Clients**:
    - Create `src/lib/supabase.ts` for Supabase client.
    - Create `src/lib/r2.ts` for AWS S3 Client (compatible with R2).

## Step 2: Database Schema (Supabase)

Create tables to mirror the local `useSeriesStore` structure.

**SQL Schema:**

```sql
create table series (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text,
  description text,
  category text,
  tags text[], -- Array of strings
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table images (
  id uuid default gen_random_uuid() primary key,
  series_id uuid references series(id) on delete cascade not null,
  file_name text,
  original_key text, -- Path in R2
  translated_key text, -- Path in R2
  status text, -- 'pending', 'processing', 'completed'
  created_at timestamptz default now()
);
```

## Step 3: Authentication (Supabase Auth)

1.  Enable Email/Password or Google Auth in Supabase dashboard.
2.  Add Login/Signup pages to Next.js (`/login`, `/signup`).
3.  Protect the main app route.

## Step 4: Refactor Stores (`useSeriesStore`)

Modify the Zustand store to act as a cache/sync manager rather than the source of truth.

1.  **Fetch on Mount**: Load series list from Supabase.
2.  **Optimistic Updates**: When user adds a series, update UI immediately, then sync to Supabase.
3.  **Image Uploads**:
    - Request a Presigned Upload URL from Next.js API.
    - Upload file directly to R2 using the presigned URL.
    - Insert record into Supabase `images` table.

## Step 5: Migration Tool

Create a utility to migrate existing IndexedDB data to the cloud.

1.  Iterate through local series.
2.  Upload images to R2.
3.  Create records in Supabase.
4.  Mark as "synced".
