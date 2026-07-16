import { NextRequest, NextResponse } from "next/server";
import { intervene, tts } from "@/lib/gemini";
import { IntervenePayloadSchema, type InterveneResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not set on the server. Add it to .env.local and restart `npm run dev`.",
      },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = IntervenePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { audioBase64, mimeType, checkIn, history } = parsed.data;
  const startedAt = Date.now();

  try {
    const result = await intervene(audioBase64, mimeType, checkIn, history);
    const audio = await tts(result.intervention_text);
    const latencyMs = Date.now() - startedAt;

    const response: InterveneResponse = {
      ...result,
      audioBase64: audio.audioBase64,
      audioMimeType: audio.mimeType,
      latencyMs,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/intervene] failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json(
      { error: `Intervention generation failed: ${message}` },
      { status: 502 }
    );
  }
}
