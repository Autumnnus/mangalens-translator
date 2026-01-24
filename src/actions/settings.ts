"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { TranslationSettings } from "@/types";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function updateUserSettingsAction(
  settings: Partial<TranslationSettings>,
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Get current settings first to merge
  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  const currentSettings = (user?.settings as TranslationSettings) || {
    targetLanguage: "Turkish",
    fontSize: 24,
    fontColor: "#000000",
    backgroundColor: "#ffffff",
    strokeColor: "#ffffff",
    customInstructions: "",
  };

  const updatedSettings = {
    ...currentSettings,
    ...settings,
  };

  await db
    .update(users)
    .set({ settings: updatedSettings })
    .where(eq(users.id, session.user.id));

  revalidatePath("/");
  return updatedSettings;
}

export async function getUserSettingsAction() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  return user?.settings as TranslationSettings | null;
}
