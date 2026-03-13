export const resolveImageUrl = (url: string | null): string => {
  if (!url) return "";

  // If it's already a full URL (http, blob, data), return it as is
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:") ||
    url.startsWith("data:")
  ) {
    return url;
  }

  // Otherwise, it's a raw R2 key, we need to wrap it
  const domain = process.env.NEXT_PUBLIC_R2_DOMAIN;
  const accountId = process.env.NEXT_PUBLIC_R2_ACCOUNT_ID;

  let base = domain;
  if (!base && accountId) {
    base = `https://pub-${accountId}.r2.dev`;
  }

  if (base) {
    const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;
    const cleanKey = url.startsWith("/") ? url.slice(1) : url;
    return `${cleanBase}/${cleanKey}`;
  }

  return url; // Final fallback
};

export const getThumbnailUrl = (
  key: string | undefined | null,
  fallbackUrl: string | null,
  width: number = 240,
  quality: number = 70,
): string => {
  if (!key) return resolveImageUrl(fallbackUrl);

  const params = new URLSearchParams({
    key,
    w: String(width),
    q: String(quality),
  });

  return `/api/images/thumbnail?${params.toString()}`;
};
