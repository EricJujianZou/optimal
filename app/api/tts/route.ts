import { NextRequest, NextResponse } from "next/server";
import { tts } from "@/lib/gemini";
import { z } from "zod";

const BodySchema = z.object({
  text: z.string().min(1).max(4000),
});

/** Lazy TTS — kept off the /api/decide critical path for speed. */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  try {
    const audio = await tts(parsed.data.text);
    return NextResponse.json({
      audioBase64: audio.audioBase64,
      audioMimeType: audio.mimeType,
    });
  } catch (err) {
    console.warn("[/api/tts] failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    const quota =
      /429|RESOURCE_EXHAUSTED|FreeTier|quota/i.test(message);
    return NextResponse.json(
      {
        error: quota
          ? "Speech quota reached for today. Device voice can still play."
          : "Speech generation failed.",
        code: quota ? "quota" : "tts_failed",
      },
      { status: 502 }
    );
  }
}
