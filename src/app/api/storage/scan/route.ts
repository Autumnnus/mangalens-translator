import { auth } from "@/auth";
import { backfillMissingImageSizes } from "@/actions/series";
import { NextResponse } from "next/server";

export const maxDuration = 300;

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await backfillMissingImageSizes(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
