import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export async function GET() {
  const deployId =
    process.env.COOLIFY_RESOURCE_UUID ||
    process.env.COOLIFY_CONTAINER_NAME ||
    process.env.HOSTNAME ||
    "unknown";

  return NextResponse.json(
    { version: `${packageJson.version}-${deployId}` },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
