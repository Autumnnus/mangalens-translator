import {
  DeleteObjectCommand,
  GetObjectCommand,
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

// Ensure global client to avoid multiple instances in dev
const globalForS3 = globalThis as unknown as { s3: S3Client };

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
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  // 1 hour expiry
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

export const deleteObject = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  await s3Client.send(command);
};
