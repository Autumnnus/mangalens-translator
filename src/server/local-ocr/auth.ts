import { timingSafeEqual } from "node:crypto";

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const authenticateLocalOcrWorker = (request: Request) => {
  const expectedToken = process.env.LOCAL_OCR_WORKER_TOKEN?.trim();
  if (!expectedToken || expectedToken.length < 32) {
    throw new Error(
      "LOCAL_OCR_WORKER_TOKEN must be configured with at least 32 characters",
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const suppliedToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!suppliedToken || !safeEqual(suppliedToken, expectedToken)) {
    return null;
  }

  const workerId = (request.headers.get("x-worker-id") || "local-worker")
    .trim()
    .slice(0, 120);
  return workerId || "local-worker";
};

export const isLocalOcrConfigured = () =>
  (process.env.LOCAL_OCR_WORKER_TOKEN?.trim().length || 0) >= 32;
