import { NextRequest, NextResponse } from "next/server";
import {
  clearProfileMemory,
  deleteProfileEvent,
  getProfile,
  getProfilePrefs,
  insertProfileEvent,
  listProfileEvents,
  setProfileSummary,
} from "@/lib/db";
import { z } from "zod";

const PutBodySchema = z.object({
  summary: z.string().max(8000),
});

const DeleteBodySchema = z.object({
  eventId: z.number().int().positive().optional(),
  clearAll: z.boolean().optional(),
});

/** View lasting profile + recent memory events. */
export async function GET() {
  const profile = getProfile();
  const events = listProfileEvents(80);
  return NextResponse.json({
    summary: profile.summary,
    prefs: getProfilePrefs(),
    updated_at: profile.updated_at,
    events,
  });
}

/** Replace the lasting profile summary (user edit). */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = PutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const summary = parsed.data.summary.trim();
  const previous = getProfile().summary;
  const profile = setProfileSummary(summary);

  if (summary !== previous.trim()) {
    insertProfileEvent({
      kind: "manual_edit",
      content: summary ? summary.slice(0, 500) : "(cleared summary)",
    });
  }

  return NextResponse.json({
    summary: profile.summary,
    updated_at: profile.updated_at,
    events: listProfileEvents(80),
  });
}

/** Delete one memory event, or clear all memory. */
export async function DELETE(req: NextRequest) {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok for clearAll via query — still require JSON for safety */
  }

  const parsed = DeleteBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  if (parsed.data.clearAll) {
    const profile = clearProfileMemory();
    return NextResponse.json({
      summary: profile.summary,
      prefs: {},
      updated_at: profile.updated_at,
      events: [],
    });
  }

  if (parsed.data.eventId != null) {
    const ok = deleteProfileEvent(parsed.data.eventId);
    if (!ok) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const profile = getProfile();
    return NextResponse.json({
      summary: profile.summary,
      prefs: getProfilePrefs(),
      updated_at: profile.updated_at,
      events: listProfileEvents(80),
    });
  }

  return NextResponse.json(
    { error: "Provide eventId or clearAll." },
    { status: 400 }
  );
}
