import { getPresignedUploadUrl } from "@/lib/r2";
import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // 1. Check Authentication
    /* 
       NOTE: We can't easily check Supabase auth server-side in a Route Handler without the cookies/headers.
       Ideally, we pass the access token in headers or use createRouteHandlerClient from @supabase/auth-helpers-nextjs.
       For simplicity now, we'll check if the Authorization header contains the token and verify it, 
       OR just rely on the client sending a user ID for metadata (insecure).
       
       Let's use the 'getUser' from auth header if possible.
    */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate JWT (basic check)
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { fileName, contentType, seriesId } = await req.json();

    if (!fileName || !contentType || !seriesId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const { uploadUrl, key } = await getPresignedUploadUrl(
      fileName,
      contentType
    );

    // We don't insert into DB here. We let the client upload effectively,
    // AND THEN the client calls another endpoint (or this one) to confirm and create the DB record.
    // OR better: we return the info, client uploads, then client inserts to Supabase directly using RLS.
    // Option 2 is better for Supabase architecture.

    // But we need the public URL.
    // NOTE: For R2, public access usually requires a custom domain or enabling public access on bucket.
    // We will assume the user has a public domain variable R2_PUBLIC_DOMAIN.
    const publicDomain = process.env.NEXT_PUBLIC_R2_DOMAIN || "";
    // If empty, user might view via presigned GETs, but that's complex for this app.
    // Let's assume public bucket for now as per "easy" setup.

    const finalUrl = publicDomain
      ? `${publicDomain}/${key}`
      : `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev/${key}`; // Default R2 dev subdomain pattern if enabled

    return NextResponse.json({ uploadUrl, key, publicUrl: finalUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
