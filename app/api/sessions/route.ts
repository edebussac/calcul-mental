import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { parseSaveSessionInput } from "@/lib/api/parse";
import { saveSession } from "@/lib/services/sessions";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const input = parseSaveSessionInput(body);
  if (!input) {
    return NextResponse.json(
      { error: "Payload de session invalide" },
      { status: 400 },
    );
  }
  const session = await saveSession(db, input);
  return NextResponse.json(session, { status: 201 });
}
