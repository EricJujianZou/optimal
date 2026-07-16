import { NextResponse } from "next/server";
import { sessionsToCsv } from "@/lib/db";

export async function GET() {
  try {
    const csv = sessionsToCsv();
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="optimal-sessions.csv"`,
      },
    });
  } catch (err) {
    console.error("[/api/sessions/csv] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
