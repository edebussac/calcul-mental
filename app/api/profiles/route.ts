import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getOrCreateProfile, listProfiles } from "@/lib/services/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const profiles = await listProfiles(db);
  return NextResponse.json(profiles);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name requis" }, { status: 400 });
  }
  const profile = await getOrCreateProfile(db, name);
  return NextResponse.json(profile, { status: 201 });
}
