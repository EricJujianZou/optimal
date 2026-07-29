import {
  getOpenRouterApiKey,
  getOpenRouterModel,
  OPENROUTER_BASE_URL,
} from "./config";
import {
  buildDecideSystemPrompt,
  buildDecideUserPrompt,
  sanitizeUserFacingText,
} from "./decide-prompts";
import { inferTimezone, type ToolSource } from "./agent-tools";
import { prefetchPlaybook } from "./playbooks";
import { DecideResultSchema, type DecideResult, type HistoryTurn } from "./types";

export type DecideOutcome = {
  result: DecideResult;
  sources: { title: string }[];
};

export type DecideProgressEvent =
  | { type: "stage"; stage: "thinking" | "gathering" | "drafting" | "done" }
  | { type: "sources"; sources: { title: string }[] }
  | {
      type: "partial";
      recommendation?: string;
      spoken_advice?: string;
      why?: string;
    };

type OrMessage = {
  role: "system" | "user" | "assistant";
  content?: string | null;
};

async function openRouterChat(args: {
  messages: OrMessage[];
  maxTokens?: number;
}): Promise<{
  message: OrMessage;
  usage?: unknown;
}> {
  const key = getOpenRouterApiKey();
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env.local and restart the server."
    );
  }

  const body: Record<string, unknown> = {
    model: getOpenRouterModel(),
    messages: args.messages,
    temperature: 0.2,
    max_tokens: args.maxTokens ?? 800,
    reasoning: { exclude: true },
  };

  let lastErr = "OpenRouter request failed";
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 35_000);
    let res: Response;
    try {
      res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3001/decide",
          "X-Title": "Megamind",
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      lastErr = err instanceof Error ? err.message : String(err);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      throw new Error(String(lastErr).slice(0, 400));
    } finally {
      clearTimeout(timer);
    }

    const data = (await res.json()) as {
      error?: { message?: string; metadata?: unknown; code?: unknown } | string;
      choices?: Array<{ message?: OrMessage }>;
      usage?: unknown;
    };

    if (res.status === 429 || res.status === 503) {
      lastErr =
        (typeof data.error === "object" && data.error?.message) ||
        `OpenRouter HTTP ${res.status}`;
      console.warn(`[openrouter] ${res.status} retry ${attempt + 1}/3`);
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }

    if (!res.ok) {
      const errObj =
        typeof data.error === "object" && data.error ? data.error : null;
      const meta =
        errObj && "metadata" in errObj
          ? JSON.stringify(
              (errObj as { metadata?: unknown }).metadata
            ).slice(0, 400)
          : "";
      const detail =
        (errObj && (errObj.message || JSON.stringify(errObj))) ||
        (typeof data.error === "string" ? data.error : null) ||
        JSON.stringify(data).slice(0, 800);
      console.warn("[openrouter]", res.status, detail, meta);
      throw new Error(
        String(detail).slice(0, 400) || `OpenRouter HTTP ${res.status}`
      );
    }

    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error("OpenRouter returned an empty message.");
    }
    return { message, usage: data.usage };
  }

  throw new Error(String(lastErr).slice(0, 400));
}

function softParseJson(text: string): unknown {
  let raw = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf("{");
  if (start >= 0) raw = raw.slice(start);
  const end = raw.lastIndexOf("}");
  if (end > 0) raw = raw.slice(0, end + 1);

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(raw);
  if (parsed != null) return parsed;

  // Ling sometimes emits Python dicts: {'status': 'ok', ...}
  if (/'status'\s*:/.test(raw) || (/^\{\s*'/.test(raw) && !/"status"\s*:/.test(raw))) {
    const py = raw
      .replace(/\bNone\b/g, "null")
      .replace(/\bTrue\b/g, "true")
      .replace(/\bFalse\b/g, "false")
      // Only rewrite single-quoted strings (preserve apostrophes inside via escapes)
      .replace(/'((?:\\'|[^'])*)'/g, (_m, inner: string) => {
        const unescaped = inner.replace(/\\'/g, "'");
        return `"${unescaped.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      });
    parsed = tryParse(py);
    if (parsed != null) return parsed;
  }

  let s = raw;
  const unescapedQuotes = s.match(/(?<!\\)"/g)?.length ?? 0;
  if (unescapedQuotes % 2 === 1) s += '"';
  const openBraces =
    (s.match(/\{/g) ?? []).length - (s.match(/\}/g) ?? []).length;
  const openBrackets =
    (s.match(/\[/g) ?? []).length - (s.match(/\]/g) ?? []).length;
  s = s.replace(/,\s*(?=[}\]])/g, "");
  s = s.replace(/,\s*$/, "");
  s += "]".repeat(Math.max(0, openBrackets));
  s += "}".repeat(Math.max(0, openBraces));
  parsed = tryParse(s);
  if (parsed != null) return parsed;

  const pseudo = parsePseudoDecide(text);
  if (pseudo) return pseudo;
  throw new Error("Unable to parse decide JSON");
}

/** Ling sometimes returns `key: value; key: value` instead of JSON. */
function parsePseudoDecide(text: string): Record<string, unknown> | null {
  const t = text.trim();
  if (!/\bstatus\s*:/i.test(t) || !/\brecommendation\s*:/i.test(t)) {
    return null;
  }

  const grab = (key: string): string | undefined => {
    const re = new RegExp(
      `${key}\\s*:\\s*([\\s\\S]*?)(?=\\s*;\\s*(?:status|clarifying_questions|recommendation|user_preference_conflict|why|spoken_advice|options|evaluation|confidence|transcript|profile_update)\\s*:|$)`,
      "i"
    );
    const m = re.exec(t);
    return m?.[1]?.trim().replace(/^["']|["']$/g, "");
  };

  const statusRaw = (grab("status") || "decide").toLowerCase();
  const recommendation = grab("recommendation") || "";
  const why = grab("why") || "";
  const spoken = grab("spoken_advice") || recommendation;
  const conflict = grab("user_preference_conflict");
  const confRaw = grab("confidence");

  if (!recommendation && statusRaw !== "clarify") return null;

  return {
    status: statusRaw.includes("clarify") ? "clarify" : "decide",
    clarifying_questions: [],
    recommendation,
    user_preference_conflict: /^(true|yes|1)$/i.test(conflict || ""),
    why,
    spoken_advice: spoken,
    options: [],
    evaluation: [],
    confidence: confRaw ? Number(confRaw) : 0.45,
    transcript: "",
    profile_update: "",
  };
}

/** Coerce common Ling quirks before Zod (0–1 scores, % confidence, object options). */
function asObjectArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  if (typeof value === "string" && value.trim()) return [value];
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    // Single item shaped like { option, score } — wrap, don't Object.values.
    if ("option" in o || "score" in o || "note" in o || "confidence" in o) {
      return [o];
    }
    const vals = Object.values(o);
    if (vals.length > 0 && vals.every((v) => v && typeof v === "object")) {
      return vals;
    }
    return [o];
  }
  return [];
}

function coerceDecidePayload(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const o = { ...(parsed as Record<string, unknown>) };

  const st = String(o.status ?? "").toLowerCase();
  if (st === "ok" || st === "success" || st === "done" || st === "answer") {
    o.status = "decide";
  }
  o.evaluation = asObjectArray(o.evaluation);
  o.alternatives = asObjectArray(o.alternatives);
  o.options = asObjectArray(o.options);
  o.clarifying_questions = asObjectArray(o.clarifying_questions);

  if (Array.isArray(o.options)) {
    o.options = o.options.map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        const r = x as Record<string, unknown>;
        return String(r.option ?? r.name ?? r.label ?? "").trim();
      }
      return String(x ?? "");
    }).filter(Boolean);
  }

  if (Array.isArray(o.clarifying_questions)) {
    o.clarifying_questions = o.clarifying_questions
      .map((q) =>
        typeof q === "string"
          ? q
          : String((q as { question?: unknown })?.question ?? q)
      )
      .filter((q) => q.trim());
  }

  if (Array.isArray(o.evaluation)) {
    o.evaluation = o.evaluation
      .map((item) => {
        if (typeof item === "string") {
          return { option: item, score: 5, note: "" };
        }
        if (!item || typeof item !== "object") return null;
        const e = { ...(item as Record<string, unknown>) };
        let score = Number(e.score);
        if (!Number.isFinite(score)) score = 5;
        if (score > 10 && score <= 100) score = score / 10;
        else if (score > 0 && score <= 1) score = score * 10;
        e.score = Math.max(0, Math.min(10, score));
        e.option = String(e.option ?? "");
        e.note = String(e.note ?? "");
        return e;
      })
      .filter(Boolean);
  }

  if (Array.isArray(o.alternatives)) {
    o.alternatives = o.alternatives
      .map((item) => {
        if (typeof item === "string") {
          return { option: item, confidence: 0.3, note: "" };
        }
        if (!item || typeof item !== "object") return null;
        const a = { ...(item as Record<string, unknown>) };
        let conf = Number(a.confidence);
        if (!Number.isFinite(conf)) conf = 0.3;
        if (conf > 1 && conf <= 100) conf /= 100;
        a.confidence = Math.max(0, Math.min(1, conf));
        a.option = String(a.option ?? "");
        a.note = String(a.note ?? "");
        return a;
      })
      .filter(Boolean);
  }

  let conf = Number(o.confidence);
  if (Number.isFinite(conf)) {
    if (conf > 1 && conf <= 100) conf /= 100;
    o.confidence = Math.max(0, Math.min(1, conf));
  } else {
    o.confidence = 0.6;
  }

  if (typeof o.user_preference_conflict === "string") {
    o.user_preference_conflict = /^(true|yes|1)$/i.test(
      o.user_preference_conflict.trim()
    );
  } else if (typeof o.user_preference_conflict !== "boolean") {
    o.user_preference_conflict = Boolean(o.user_preference_conflict);
  }

  for (const key of [
    "recommendation",
    "why",
    "spoken_advice",
    "transcript",
    "profile_update",
  ] as const) {
    if (o[key] != null && typeof o[key] !== "string") {
      o[key] = String(o[key]);
    }
  }

  return o;
}

function sanitizeDecideResult(result: DecideResult): DecideResult {
  return {
    ...result,
    recommendation: sanitizeUserFacingText(result.recommendation),
    why: sanitizeUserFacingText(result.why),
    spoken_advice: sanitizeUserFacingText(result.spoken_advice),
    clarifying_questions: result.clarifying_questions.map((q) =>
      sanitizeUserFacingText(q)
    ),
    options: result.options.map((o) => sanitizeUserFacingText(o)),
    alternatives: result.alternatives.map((a) => ({
      ...a,
      option: sanitizeUserFacingText(a.option),
      note: sanitizeUserFacingText(a.note),
    })),
    evaluation: result.evaluation.map((e) => ({
      ...e,
      option: sanitizeUserFacingText(e.option),
      note: sanitizeUserFacingText(e.note),
    })),
    profile_update: sanitizeUserFacingText(result.profile_update),
  };
}

function looksLikeClarifyAsk(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /\b(i (can't|cannot|need to know|need one more|don't have enough)|before i (can )?(recommend|decide)|i need to know|clarif|tell me (more|whether|if)|what(?:'s| is) your (runway|savings|budget|timeline)|how much (runway|savings)|missing (detail|info))\b/i.test(
    t
  );
}

function normalizeDecide(result: DecideResult): DecideResult {
  const qs = result.clarifying_questions
    .map((q) => q.trim())
    .filter(Boolean);
  const rec = result.recommendation.trim();

  // Model sometimes stuffs a clarifying ask into recommendation with status=decide.
  if (
    result.status === "clarify" ||
    qs.length > 0 ||
    (rec && looksLikeClarifyAsk(rec) && !/\b(do this|tip |take |stay |cancel |book )/i.test(rec))
  ) {
    const questions =
      qs.length > 0
        ? qs.slice(0, 2)
        : [rec.replace(/^i can't[^.]*\.\s*/i, "").trim() || rec].filter(Boolean);
    return sanitizeDecideResult({
      ...result,
      status: "clarify",
      clarifying_questions: questions.slice(0, 2),
      recommendation: "",
      why: "",
      alternatives: [],
      evaluation: [],
      confidence: 0,
      spoken_advice:
        result.spoken_advice.trim() ||
        questions[0] ||
        "Need one detail first.",
    });
  }

  if (rec) {
    return sanitizeDecideResult({
      ...result,
      status: "decide",
      clarifying_questions: [],
      spoken_advice:
        result.spoken_advice.trim() || result.recommendation.trim(),
    });
  }

  return sanitizeDecideResult(result);
}

function dedupeSources(sources: ToolSource[]): { title: string }[] {
  const out: { title: string }[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    const title = sanitizeUserFacingText(s.title || "").slice(0, 120);
    const key = title.toLowerCase().slice(0, 60);
    if (!title || seen.has(key)) continue;
    seen.add(key);
    out.push({ title });
    if (out.length >= 8) break;
  }
  return out;
}

function tryFinalize(content: string | null | undefined): DecideResult | null {
  if (!content?.trim()) return null;
  let parsed: unknown = null;
  try {
    parsed = coerceDecidePayload(softParseJson(content));
    const result = normalizeDecide(DecideResultSchema.parse(parsed));
    if (result.status === "decide" && !result.recommendation.trim()) return null;
    if (
      result.status === "clarify" &&
      result.clarifying_questions.length === 0 &&
      !result.spoken_advice.trim()
    ) {
      return null;
    }
    return result;
  } catch (err) {
    const detail =
      err && typeof err === "object" && "issues" in err
        ? JSON.stringify((err as { issues: unknown }).issues).slice(0, 280)
        : err instanceof Error
          ? err.message
          : String(err);
    console.warn(
      "[decide:or] parse miss:",
      detail,
      content.slice(0, 220).replace(/\s+/g, " ")
    );
    return salvagePartialDecide(content, parsed);
  }
}

/** Last-chance extract when Ling truncates mid-JSON. */
function salvagePartialDecide(
  content: string,
  parsed: unknown
): DecideResult | null {
  const o =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  let recommendation =
    (typeof o?.recommendation === "string" && o.recommendation) || "";
  let why = (typeof o?.why === "string" && o.why) || "";
  let spoken =
    (typeof o?.spoken_advice === "string" && o.spoken_advice) || "";
  if (!recommendation) {
    const m = /"recommendation"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(content);
    if (m) recommendation = m[1].replace(/\\"/g, '"');
  }
  if (!why) {
    const m = /"why"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(content);
    if (m) why = m[1].replace(/\\"/g, '"');
  }
  if (!spoken) {
    const m = /"spoken_advice"\s*:\s*"((?:\\.|[^"\\])*)"/i.exec(content);
    if (m) spoken = m[1].replace(/\\"/g, '"');
  }
  if (!recommendation.trim()) return null;
  try {
    return normalizeDecide(
      DecideResultSchema.parse({
        status: "decide",
        clarifying_questions: [],
        recommendation: recommendation.trim(),
        user_preference_conflict: false,
        why: why.trim() || recommendation.trim(),
        spoken_advice: spoken.trim() || recommendation.trim(),
        options: [],
        evaluation: [],
        alternatives: [],
        confidence: 0.35,
        transcript: "",
        profile_update: "",
      })
    );
  } catch {
    return null;
  }
}

/**
 * Prefetch playbook facts, then one Ling synthesis call.
 */
export async function decide(args: {
  textSituation?: string;
  history: HistoryTurn[];
  profileSummary: string;
  transcriptHint?: string;
  lat?: number;
  lon?: number;
  prefsBlock?: string;
  onProgress?: (e: DecideProgressEvent) => void;
}): Promise<DecideOutcome> {
  const t0 = Date.now();
  const situation = (args.textSituation || args.transcriptHint || "").trim();
  const inferredTimezone = inferTimezone(situation);
  const emit = args.onProgress;

  emit?.({ type: "stage", stage: "gathering" });
  const prefetch = await prefetchPlaybook({
    situation,
    lat: args.lat,
    lon: args.lon,
    onTool: (_name, srcs) => {
      emit?.({ type: "sources", sources: dedupeSources(srcs) });
    },
  });

  const sources = dedupeSources(prefetch.sources);
  emit?.({ type: "sources", sources });

  const messages: OrMessage[] = [
    {
      role: "system",
      content: buildDecideSystemPrompt(args.profileSummary, {
        factsMode: true,
        inferredTimezone,
        prefsBlock: args.prefsBlock,
      }),
    },
    {
      role: "user",
      content: buildDecideUserPrompt({
        textSituation: args.textSituation || args.transcriptHint,
        history: args.history,
        hasAudio: Boolean(args.transcriptHint && !args.textSituation),
        factsJson: prefetch.factsJson,
        intent: prefetch.intent,
      }),
    },
  ];

  emit?.({ type: "stage", stage: "drafting" });

  for (let attempt = 0; attempt < 3; attempt++) {
    const { message } = await openRouterChat({
      messages,
      maxTokens: 900,
    });

    if (!message.content?.trim()) {
      console.warn(
        `[decide:or] empty content attempt=${attempt} tools=${prefetch.toolCalls}`
      );
      messages.push({
        role: "user",
        content:
          'Previous reply was empty. Output ONE JSON object now with status "decide" or "clarify".',
      });
      if (attempt < 2) continue;
    }

    let result = tryFinalize(message.content);
    if (!result && message.content?.trim()) {
      console.warn(
        "[decide:or] final parse miss",
        message.content.slice(0, 180).replace(/\s+/g, " ")
      );
    }

    if (result) {
      emit?.({
        type: "partial",
        recommendation: result.recommendation,
        spoken_advice: result.spoken_advice,
        why: result.why,
      });
      if (!result.transcript?.trim()) {
        result = {
          ...result,
          transcript: situation.slice(0, 500),
        };
      }
      console.info(
        `[decide:or] intent=${prefetch.intent} tools=${prefetch.toolCalls} sources=${sources.length} tz=${inferredTimezone || "-"} total=${Date.now() - t0}ms`
      );
      emit?.({ type: "stage", stage: "done" });
      return { result, sources };
    }

    messages.push({ role: "assistant", content: message.content });
    messages.push({
      role: "user",
      content:
        'Reply with ONLY valid JSON using double quotes. Example: {"status":"decide","clarifying_questions":[],"recommendation":"...","user_preference_conflict":false,"why":"...","spoken_advice":"...","options":[],"evaluation":[],"confidence":0.7,"transcript":"","profile_update":""}',
    });
  }

  throw new Error("OpenRouter returned empty or invalid decide JSON.");
}
