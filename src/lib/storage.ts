import {
  _Object,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3_ENDPOINT = process.env.MINIO_ENDPOINT || "http://localhost:9000";
const S3_BUCKET = process.env.MINIO_BUCKET_NAME || "mangalens";
const S3_ACCESS_KEY = process.env.MINIO_ROOT_USER || "minioadmin";
const S3_SECRET_KEY = process.env.MINIO_ROOT_PASSWORD || "minioadmin";
const PUBLIC_URL =
  process.env.NEXT_PUBLIC_MINIO_URL || "http://localhost:9000/mangalens";
const VIEW_URL_TTL_SECONDS = 3600;
const VIEW_URL_CACHE_BUFFER_MS = 60_000;

// Ensure global client to avoid multiple instances in dev
const globalForS3 = globalThis as unknown as {
  s3: S3Client;
  viewUrlCache: Map<string, { url: string; expiresAt: number }>;
};

const viewUrlCache = globalForS3.viewUrlCache || new Map();
if (process.env.NODE_ENV !== "production") globalForS3.viewUrlCache = viewUrlCache;

export const s3Client =
  globalForS3.s3 ||
  new S3Client({
    region: "auto",
    endpoint: S3_ENDPOINT,
    credentials: {
      accessKeyId: S3_ACCESS_KEY,
      secretAccessKey: S3_SECRET_KEY,
    },
    forcePathStyle: true, // Required for MinIO
  });

if (process.env.NODE_ENV !== "production") globalForS3.s3 = s3Client;

export const getPresignedUploadUrl = async (
  key: string,
  contentType: string,
) => {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 10 minutes
  return { uploadUrl: url, key, publicUrl: `${PUBLIC_URL}/${key}` };
};

export const getPresignedViewUrl = async (key: string) => {
  const cached = viewUrlCache.get(key);
  if (cached && cached.expiresAt - Date.now() > VIEW_URL_CACHE_BUFFER_MS) {
    return cached.url;
  }

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, {
    expiresIn: VIEW_URL_TTL_SECONDS,
  });
  viewUrlCache.set(key, {
    url,
    expiresAt: Date.now() + VIEW_URL_TTL_SECONDS * 1000,
  });
  return url;
};

export const deleteObject = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  await s3Client.send(command);
};

export const listObjects = async (prefix?: string): Promise<_Object[]> => {
  let allContents: _Object[] = [];
  let isTruncated = true;
  let nextContinuationToken: string | undefined = undefined;

  while (isTruncated) {
    const command: ListObjectsV2Command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: prefix,
      ContinuationToken: nextContinuationToken,
    });
    const result = await s3Client.send(command);
    allContents = allContents.concat(result.Contents || []);
    isTruncated = result.IsTruncated || false;
    nextContinuationToken = result.NextContinuationToken;
  }
  return allContents;
};

export const getObjectBuffer = async (key: string) => {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  const response = await s3Client.send(command);
  return response.Body?.transformToByteArray();
};

export const uploadObject = async (
  key: string,
  body: Uint8Array | Buffer | string,
  contentType?: string,
) => {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await s3Client.send(command);
};

export const deleteByPrefix = async (prefix: string) => {
  // List all objects with the prefix
  const objects = await listObjects(prefix);

  if (objects.length === 0) {
    return { deleted: 0 };
  }

  // Delete all objects using bulk delete command
  const keys = objects
    .map((obj) => obj.Key)
    .filter((key): key is string => !!key);

  if (keys.length === 0) return { deleted: 0 };

  // S3 DeleteObjects supports up to 1000 keys per request
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE);
    const command = new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: chunk.map((key) => ({ Key: key })),
        Quiet: true,
      },
    });
    await s3Client.send(command);
  }

  return { deleted: keys.length };
};
