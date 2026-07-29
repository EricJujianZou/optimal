import { NextRequest, NextResponse } from "next/server";
import { insertProfileEvent, setProfilePrefs } from "@/lib/db";
import { DecideFeedbackSchema } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = DecideFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { decisionId, outcome, note } = parsed.data;
  const content = note?.trim()
    ? `${outcome}: ${note.trim()}`
    : outcome;

  insertProfileEvent({
    kind: "outcome",
    content: content.slice(0, 500),
    decision_id: decisionId,
  });

  if (outcome === "did_it") {
    // Light nudge: following through → slightly lower money anxiety / keep tip habit.
    setProfilePrefs({});
  } else if (outcome === "ignored") {
    setProfilePrefs({ money_anxiety: "medium" });
  }

  return NextResponse.json({ ok: true, decisionId, outcome });
}
