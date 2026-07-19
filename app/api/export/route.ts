import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { exportAnswerRows, exportJson } from "@/lib/services/export";
import { toAnswersCsv } from "@/lib/export/csv";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = Number(searchParams.get("profileId"));
  if (!Number.isFinite(profileId) || profileId <= 0) {
    return NextResponse.json({ error: "profileId requis" }, { status: 400 });
  }
  const format = searchParams.get("format") === "csv" ? "csv" : "json";

  if (format === "csv") {
    const csv = toAnswersCsv(await exportAnswerRows(db, profileId));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="calcul-mental-${profileId}.csv"`,
      },
    });
  }

  const data = await exportJson(db, profileId);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="calcul-mental-${profileId}.json"`,
    },
  });
}
