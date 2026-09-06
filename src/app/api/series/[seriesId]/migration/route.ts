import { describeError } from "@/server/errors";
import { auth } from "@/auth";
import {
  dropSeriesLegacyRenders,
  getMigrationStats,
  startSeriesMigration,
} from "@/server/migration/legacy";
import { NextResponse } from "next/server";
import { z } from "zod";

type Context = { params: Promise<{ seriesId: string }> };

const startSchema = z.object({
  strategy: z.enum(["legacy", "redetect"]),
  imageIds: z.array(z.string().uuid()).max(2000).optional(),
});

const seriesIdOf = async (context: Context) => {
  const { seriesId } = await context.params;
  return z.string().uuid().safeParse(seriesId).success ? seriesId : null;
};

/** Migration counters for a series. */
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const seriesId = await seriesIdOf(context);
  if (!seriesId) return NextResponse.json({ error: "Invalid series id" }, { status: 400 });
  return NextResponse.json(await getMigrationStats(seriesId, session.user.id));
}

/** Queues migration jobs: "legacy" re-typesets for free, "redetect" runs Gemini. */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const seriesId = await seriesIdOf(context);
  if (!seriesId) return NextResponse.json({ error: "Invalid series id" }, { status: 400 });
  const parsed = startSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  try {
    const result = await startSeriesMigration({
      userId: session.user.id,
      seriesId,
      strategy: parsed.data.strategy,
      imageIds: parsed.data.imageIds,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    console.error("Series migration start failed", seriesId, error);
    return NextResponse.json(
      { error: describeError(error, "Migration could not be started") },
      { status: 500 },
    );
  }
}

/** Deletes the kept v1 renders of every migrated page in the series. */
export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const seriesId = await seriesIdOf(context);
  if (!seriesId) return NextResponse.json({ error: "Invalid series id" }, { status: 400 });
  try {
    return NextResponse.json(await dropSeriesLegacyRenders(seriesId, session.user.id));
  } catch (error) {
    console.error("Legacy cleanup failed", seriesId, error);
    return NextResponse.json(
      { error: describeError(error, "Cleanup failed") },
      { status: 500 },
    );
  }
}
