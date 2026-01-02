import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

if (
  !R2_ACCOUNT_ID ||
  !R2_ACCESS_KEY_ID ||
  !R2_SECRET_ACCESS_KEY ||
  !R2_BUCKET_NAME
) {
  console.warn("Missing R2 environment variables. Uploads will fail.");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export const getPresignedUploadUrl = async (
  fileName: string,
  contentType: string,
  seriesId: string
) => {
  const cleanFileName = fileName.replace(/\s+/g, "-");
  const key = `${seriesId}/${Date.now()}_${cleanFileName}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(r2Client, command, { expiresIn: 600 }); // 10 minutes
  // Construct the public URL (assuming public access is enabled or via worker)
  // For R2, if you have a custom domain or public bucket, use that.
  // Otherwise, we might need a worker. For now, we'll try to use the S3 style or assume a public domain var.
  // Ideally, R2_PUBLIC_URL should be set in .env
  const publicUrl = process.env.R2_PUBLIC_URL
    ? `${process.env.R2_PUBLIC_URL}/${key}`
    : `${R2_ENDPOINT}/${R2_BUCKET_NAME}/${key}`; // This often doesn't work directly for public access without config

  return { uploadUrl: url, key, publicUrl };
};

export const deleteR2Object = async (key: string) => {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  await r2Client.send(command);
};
