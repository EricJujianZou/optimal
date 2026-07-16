import { NextRequest, NextResponse } from "next/server";
import { insertSession, listSessions } from "@/lib/db";
import { NewSessionSchema } from "@/lib/types";

export async function GET() {
  try {
    const rows = listSessions();
    return NextResponse.json({ sessions: rows });
  } catch (err) {
    console.error("[/api/sessions] GET failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = NewSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const row = insertSession(parsed.data);
    return NextResponse.json({ session: row }, { status: 201 });
  } catch (err) {
    console.error("[/api/sessions] POST failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
