"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

export async function fetchCategoriesAction() {
  const session = await auth();
  if (!session?.user?.id) return [];

  return await db.query.categories.findMany({
    where: eq(schema.categories.userId, session.user.id),
    orderBy: desc(schema.categories.createdAt),
  });
}

export async function createCategoryAction(
  name: string,
  parentId?: string,
  color?: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [newCat] = await db
    .insert(schema.categories)
    .values({
      name,
      parentId,
      color,
      userId: session.user.id,
    })
    .returning();

  return newCat;
}

export async function updateCategoryAction(
  id: string,
  name: string,
  parentId?: string | null,
  color?: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const updateData: {
    name: string;
    updatedAt: Date;
    parentId?: string | null;
    color?: string;
  } = {
    name,
    updatedAt: new Date(),
  };
  if (parentId !== undefined) updateData.parentId = parentId;
  if (color !== undefined) updateData.color = color;

  await db
    .update(schema.categories)
    .set(updateData)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.userId, session.user.id),
      ),
    );
}

export async function deleteCategoryAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .delete(schema.categories)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.userId, session.user.id),
      ),
    );
}
