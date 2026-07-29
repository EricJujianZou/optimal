/**
 * Smoke-test /api/decide (text path).
 *
 * Usage:
 *   GEMINI_API_KEY=... node --env-file=.env.local scripts/smoke-decide.mjs
 *   # or with a running `npm run dev`:
 *   curl -s localhost:3000/api/decide -H 'content-type: application/json' \
 *     -d '{"textSituation":"Should I go to the gym or rest tonight?","extraContext":"I slept 5 hours"}'
 */
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY missing. Add .env.local and retry.");
  process.exit(1);
}

const base = process.env.SMOKE_BASE_URL;

async function viaHttp() {
  const res = await fetch(`${base}/api/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      textSituation:
        "Should I take a demanding internship this summer, or stay home and ship my own project?",
    }),
  });
  const data = await res.json();
  console.log("status", res.status);
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok) process.exit(1);
}

async function viaDirect() {
  // Minimal connectivity check — full decide path needs Next server + SQLite.
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-flash-lite-latest",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: 'Reply with JSON only: {"ok":true,"pick":"ship own project"}',
          },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });
  console.log("direct gemini ok:", response.text);
}

if (base) {
  await viaHttp();
} else {
  console.log("No SMOKE_BASE_URL — running direct Gemini connectivity check.");
  console.log("Start `npm run dev` and re-run with SMOKE_BASE_URL=http://localhost:3000 for full path.");
  await viaDirect();
}
