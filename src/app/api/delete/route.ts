import { deleteR2Object } from "@/lib/r2";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { keys } = await req.json();

    if (!keys || !Array.isArray(keys)) {
      return NextResponse.json({ error: "Invalid keys" }, { status: 400 });
    }

    // Delete multiple objects from R2
    const results = await Promise.allSettled(
      keys
        .filter((k) => k && typeof k === "string")
        .map((key) => deleteR2Object(key))
    );

    return NextResponse.json({
      message: "Deletion processed",
      results: results.map((r) => r.status),
    });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
