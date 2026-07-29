import { NextRequest, NextResponse } from "next/server";
import { AudioValidationError } from "@/lib/audio";
import {
  formatPrefsBlock,
  getProfile,
  getProfilePrefs,
  insertDecision,
  insertProfileEvent,
  setProfilePrefs,
  setProfileSummary,
} from "@/lib/db";
import { decide } from "@/lib/gemini";
import type { DecideProgressEvent } from "@/lib/openrouter-decide";
import {
  DecidePayloadSchema,
  type DecideResponse,
  type ProfilePrefs,
} from "@/lib/types";

function toPublicResponse(
  result: Awaited<ReturnType<typeof decide>>["result"],
  extras: {
    latencyMs: number;
    decisionId: number | null;
    sources: { title: string }[];
  }
): DecideResponse {
  return {
    status: result.status,
    transcript: result.transcript,
    clarifying_questions: result.clarifying_questions,
    options: result.options,
    options_source: result.options_source,
    recommendation: result.recommendation,
    user_preference_conflict: result.user_preference_conflict,
    why: result.why,
    alternatives: result.alternatives.map(({ option, note }) => ({
      option,
      note,
    })),
    spoken_advice: result.spoken_advice,
    audioBase64: null,
    audioMimeType: null,
    latencyMs: extras.latencyMs,
    decisionId: extras.decisionId,
    sources: extras.sources,
  };
}

function scheduleProfileAppend(
  currentSummary: string,
  notes: string[],
  decisionId: number | null
) {
  if (notes.length === 0) return;
  for (const note of notes) {
    insertProfileEvent({
      kind: "profile_update",
      content: note,
      decision_id: decisionId,
    });
  }
  const interim = [currentSummary.trim(), ...notes.map((n) => `- ${n}`)]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  setProfileSummary(interim);
}

function mergePrefsFromUpdate(
  note: string,
  lat?: number,
  lon?: number
): void {
  const patch: ProfilePrefs = {};
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    patch.lat = lat;
    patch.lon = lon;
  }
  const tip = /tip.*?(\d{1,2})\s*%/i.exec(note);
  if (tip) patch.default_tip_pct = Number(tip[1]);
  if (/risk.?averse|cautious|security/i.test(note)) {
    patch.risk_tolerance = "low";
  } else if (/risk.?tolerant|aggressive/i.test(note)) {
    patch.risk_tolerance = "high";
  }
  if (/save money|frugal|budget/i.test(note)) {
    patch.money_anxiety = "high";
  }
  if (Object.keys(patch).length > 0) setProfilePrefs(patch);
}

function wantsJson(req: NextRequest): boolean {
  const accept = req.headers.get("accept") || "";
  return accept.includes("application/json") && !accept.includes("text/event-stream");
}

async function runDecide(
  parsed: ReturnType<typeof DecidePayloadSchema.parse>,
  onProgress?: (e: DecideProgressEvent) => void
) {
  const profile = getProfile();
  const prefs = getProfilePrefs();
  const prefsBlock = formatPrefsBlock(prefs);
  const { audioBase64, mimeType, textSituation, history, lat, lon } = parsed;
  const trimmedHistory = history.slice(-3);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    setProfilePrefs({ lat, lon });
  }

  const startedAt = Date.now();
  const { result, sources } = await decide({
    audioBase64,
    mimeType,
    textSituation,
    history: trimmedHistory,
    profileSummary: profile.summary,
    lat: lat ?? prefs.lat,
    lon: lon ?? prefs.lon,
    prefsBlock,
    onProgress,
  });
  const latencyMs = Date.now() - startedAt;

  if (result.status === "clarify") {
    if (result.profile_update?.trim()) {
      scheduleProfileAppend(
        profile.summary,
        [result.profile_update.trim()],
        null
      );
      mergePrefsFromUpdate(result.profile_update, lat, lon);
    }
    return toPublicResponse(result, { latencyMs, decisionId: null, sources });
  }

  const decision = insertDecision({
    transcript: result.transcript,
    extra_context: sources.map((s) => s.title).join(" | ").slice(0, 500),
    options: result.options,
    options_source: result.options_source,
    recommendation: result.recommendation,
    why: result.why,
    alternatives: result.alternatives,
    confidence: result.confidence,
    spoken_advice: result.spoken_advice,
    latency_ms: latencyMs,
  });

  const notes: string[] = [];
  if (result.profile_update?.trim()) notes.push(result.profile_update.trim());
  scheduleProfileAppend(profile.summary, notes, decision.id);
  if (result.profile_update?.trim()) {
    mergePrefsFromUpdate(result.profile_update, lat, lon);
  }

  if (result.transcript.trim()) {
    insertProfileEvent({
      kind: "situation",
      content: result.transcript.trim().slice(0, 500),
      decision_id: decision.id,
    });
  }

  return toPublicResponse(result, {
    latencyMs,
    decisionId: decision.id,
    sources,
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = DecidePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      {
        error:
          "OPENROUTER_API_KEY is not set on the server. Add it to .env.local and restart `npm run dev`.",
      },
      { status: 500 }
    );
  }

  if (wantsJson(req)) {
    try {
      const response = await runDecide(parsed.data);
      return NextResponse.json(response);
    } catch (err) {
      return handleDecideError(err, parsed.data.audioBase64);
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      };
      try {
        send({ type: "stage", stage: "thinking" });
        const response = await runDecide(parsed.data, (e) => {
          send(e);
        });
        send({ type: "final", result: response });
        send({ type: "stage", stage: "done" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error.";
        console.error("[/api/decide] stream failed:", message);
        const friendly = /rate limit|free-models-per-min|429/i.test(message)
          ? "Megamind is rate-limited right now. Wait a few seconds and try again."
          : err instanceof AudioValidationError
            ? message
            : "Couldn't finish that decision. Try again — usually works on retry.";
        send({
          type: "error",
          error: friendly,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function handleDecideError(err: unknown, audioBase64?: string) {
  if (err instanceof AudioValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[/api/decide] failed:", err);
  const message = err instanceof Error ? err.message : "Unknown error.";
  if (/rate limit|free-models-per-min|429/i.test(message)) {
    return NextResponse.json(
      {
        error:
          "Megamind is rate-limited right now. Wait a few seconds and try again.",
      },
      { status: 429 }
    );
  }
  if (/INVALID_ARGUMENT|invalid argument/i.test(message)) {
    return NextResponse.json(
      {
        error: audioBase64
          ? "Couldn't process that recording — try again or type instead."
          : "Couldn't finish that decision. Try again — usually works on retry.",
      },
      { status: 400 }
    );
  }
  return NextResponse.json(
    {
      error:
        "Couldn't finish that decision. Try again — usually works on retry.",
    },
    { status: 502 }
  );
}
