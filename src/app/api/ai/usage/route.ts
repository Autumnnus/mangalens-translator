import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { describeError } from "@/server/errors";
import { resolveAiSettings } from "@/server/llm/settings";
import { getUsageSummary } from "@/server/usage/summary";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/** Usage, cost and limit standing of the signed-in account. `tz` sets the day boundaries. */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
    const ai = resolveAiSettings((user?.settings || {}) as Partial<TranslationSettings>);
    const summary = await getUsageSummary(session.user.id, ai, {
      timeZone: request.nextUrl.searchParams.get("tz"),
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("Usage summary failed", error);
    return NextResponse.json({ error: describeError(error, "Usage could not be loaded") }, { status: 500 });
  }
}
