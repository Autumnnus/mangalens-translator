import { auth } from "@/auth";
import { processTranslateAll } from "@/server/gemini/translate-all";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 300;

const requestSchema = z.object({
  seriesId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request payload" },
        { status: 400 },
      );
    }

    void processTranslateAll(parsed.data.seriesId, session.user.id);

    return NextResponse.json({ queued: true }, { status: 202 });
  } catch (error) {
    console.error("translate-all route error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
