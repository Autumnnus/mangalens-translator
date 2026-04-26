import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_SETTINGS: TranslationSettings = {
  targetLanguage: "Turkish",
  fontSize: 24,
  fontColor: "#000000",
  backgroundColor: "#ffffff",
  strokeColor: "#ffffff",
  customInstructions: "",
  model: "gemini-2.5-flash",
  batchSize: 10,
  batchDelay: 0,
  useCustomApiKey: false,
  customApiKeyPool: "",
  namedApiKeys: [],
};

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    return NextResponse.json(
      (user?.settings as TranslationSettings | null) || DEFAULT_SETTINGS,
    );
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

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const incoming = (await req.json()) as Partial<TranslationSettings>;

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    const currentSettings =
      (user?.settings as TranslationSettings | null) || DEFAULT_SETTINGS;

    const updatedSettings: TranslationSettings = {
      ...currentSettings,
      ...incoming,
    };

    await db
      .update(users)
      .set({ settings: updatedSettings })
      .where(eq(users.id, session.user.id));

    return NextResponse.json(updatedSettings);
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
