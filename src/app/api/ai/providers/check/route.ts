import { auth } from "@/auth";
import { describeError } from "@/server/errors";
import { checkProvider } from "@/server/llm/check";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  provider: z.object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(80),
    preset: z.string().min(1).max(40),
    kind: z.enum(["gemini", "openai"]),
    baseUrl: z.string().trim().max(300).optional(),
    apiKeys: z.array(z.string().trim().min(1).max(500)).max(50),
    freeTier: z.boolean().optional(),
  }),
});

/**
 * Checks a provider's keys (the unsaved values from the settings form) without
 * spending tokens. Keys are never echoed back, only their masked hints.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  try {
    const result = await checkProvider(parsed.data.provider);
    if (result.keys.length === 0) {
      return NextResponse.json({ error: "Add an API key first" }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: describeError(error, "Check failed") }, { status: 500 });
  }
}
