import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createPageJob, findActivePageJob, pumpPageJobs, toPageJobSummary } from "@/server/jobs/pageJobs";
import { aiSettingsProblem } from "@/server/llm/settings";
import { getOwnedImage } from "@/server/pages/layoutService";
import { resolvePageSettings } from "@/server/pipeline/translatePage";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

type Context = { params: Promise<{ imageId: string }> };

const bodySchema = z.object({
  targetLanguage: z.string().min(1).max(100).optional(),
  customInstructions: z.string().max(4000).optional(),
});

/**
 * Queues a page job. Work happens on the server in the background; the client
 * follows progress through GET /api/jobs. A page already being processed
 * returns its current job instead of starting another.
 */
export async function POST(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { imageId } = await context.params;
  if (!z.string().uuid().safeParse(imageId).success) {
    return NextResponse.json({ error: "Invalid image id" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
  const image = await getOwnedImage(imageId, userId);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const existing = await findActivePageJob(image.id);
  if (existing) {
    return NextResponse.json({ job: toPageJobSummary(existing), existing: true });
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const stored = (user?.settings || {}) as Partial<TranslationSettings>;
  const problem = aiSettingsProblem(resolvePageSettings(stored).ai);
  if (problem) {
    return NextResponse.json({ error: `${problem} Open Settings → AI providers.` }, { status: 400 });
  }

  const job = await createPageJob({
    userId,
    seriesId: image.seriesId,
    imageId: image.id,
    provider: "ai",
    requestedPipeline: "ai",
    options: parsed.data,
  });
  void pumpPageJobs();
  return NextResponse.json({ job: toPageJobSummary(job) }, { status: 202 });
}
