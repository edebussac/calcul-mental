import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { recentSessions } from "@/lib/services/sessions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = Number(searchParams.get("profileId"));
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "profileId requis" }, { status: 400 });
  }
  const sessions = await recentSessions(db, profileId, 50);
  return NextResponse.json(sessions);
}
