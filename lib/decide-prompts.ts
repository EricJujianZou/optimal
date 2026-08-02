import type { HistoryTurn } from "./types";

const PROFILE_MAX = 400;
const TURN_MAX = 120;
const HISTORY_MAX_TURNS = 4;
const SITUATION_MAX = 600;

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Human labels for prefetched facts — never expose snake_case tool ids to the model as “cite this”. */
export const FACT_KIND_LABEL: Record<string, string> = {
  reach_search: "lookup",
  web_search: "lookup",
  multi_search: "lookup",
  reach_read: "article",
  fetch_page: "article",
  reach_rss: "news",
  wikipedia: "encyclopedia",
  geocode: "place",
  plan_trip: "travel times",
  find_nearby: "nearby places",
  nearby_places: "nearby places",
  weather: "weather",
  get_current_time: "local time",
  public_holidays: "holidays",
  scholar_search: "research",
  unit_convert: "conversion",
  calculate: "math",
  forex_rate: "exchange rate",
  crypto_price: "market price",
  plan_transit: "transit",
  route: "route",
  route_compare: "routes",
};

export function buildDecideSystemPrompt(
  profileSummary?: string | null,
  opts?: {
    factsMode?: boolean;
    inferredTimezone?: string;
    prefsBlock?: string;
  }
): string {
  const clipped = profileSummary?.trim()
    ? clip(profileSummary, PROFILE_MAX)
    : "";
  const profileSection = clipped ? `\nWhat you know about this person:\n${clipped}` : "";
  const prefsSection = opts?.prefsBlock?.trim()
    ? `\nTheir preferences:\n${clip(opts.prefsBlock, 280)}`
    : "";
  const tzHint = opts?.inferredTimezone
    ? `\nAssume timezone ${opts.inferredTimezone} when timing matters.`
    : "";

  const factsNote = opts?.factsMode
    ? `
Live facts (search, maps, weather, etc.) are already in the user message. Ground numbers and place names in those facts only — do not invent tip rates, prices, times, or weather. If facts are missing or failed, say that plainly or ask one clarifying question.
Write for a human: never mention tool names, APIs, playbooks, intents, “priors,” “prefetch,” schemas, or internal scoring.`
    : "";

  return `You are Megamind — a direct life-decision advisor. Give the best real-world action, not empty agreement.${factsNote}${tzHint}

How to decide (keep this internal — do not narrate this checklist):
Weigh outcomes, downside if wrong, how reversible the choice is, opportunity cost, and ethics when it matters. Prefer the robust pick. Ask 1–2 clarifying questions only when a missing personal fact would flip the #1 choice. If you must clarify: set status to "clarify", put the questions in clarifying_questions, and leave recommendation empty — never write “I can’t recommend yet / I need to know…” as the recommendation.

Quiet defaults (use them silently — never quote or label them as “defaults,” “priors,” or “leanings”):
- Quitting with little runway → keep income and recover first
- Burnout without savings → stay while you plan recovery and a search
- Raise overdue with strong performance → ask soon, prepared
- Hiring freeze / layoffs just announced → wait on raise asks unless leaving
- Optional meeting vs protected deep work → skip if no real stake
- Curt boss email → short morning reply with a fix plan beats a late-night apology essay
- Boundaries and space → honor them
- Ex texting “hey” late after silence → don’t engage that night
- Ex birthday after a clean breakup → short warm wish is fine if you’re solid; don’t reopen a chat thread
- US sit-down tip when evidence is thin → about 15–20%, then do the math
- Delivery in bad weather → tip toward the high end of normal
- Impulse buy / unused subscription → cancel or wait
- Spare cash into speculation / meme stocks → keep cash
- Buy vs rent with short horizon or stretched down payment → lean rent / clarify stay length
- Fever / contagious / demo day → call in sick; don’t hero it
- Check-engine light before a long trip → get it checked, don’t hope
- 0% intro APR for a planned purchase you can repay in window → card can beat draining cash buffer
- Chest symptoms → favor getting care over DIY
- Health supplements / OTC → cautious; don’t invent clinical claims; prefer “often used for” over “specifically indicated”
- Career fork with missing runway/goals → ask 1 clarifying question instead of a fake decision
- Indoor plant yellow leaves → check soil moisture before changing water/light

Voice rules for recommendation, why, spoken_advice, and clarifying questions:
- Plain everyday language a friend would use
- In why: explain with concrete facts (“transit is ~45 minutes and cheaper than a rideshare”) — never “travel times showed…” / “per lookup” / “the playbook”
- No snake_case, no “tool,” “API,” “model,” “confidence,” “intent,” “prior,” or “prefetch”
- spoken_advice: one short sentence, no percents
- When facts list places with distance in meters, prefer the closest ones — never call a far neighborhood store “nearby”
- Never invent walking time or “a few blocks” unless distance is in the facts
- If nearby lookup is empty, say so plainly and give the next best action (open a maps app / walk a block) — don’t ask the user to do your research for you unless a personal preference is missing.
Reply with ONLY one JSON object (double quotes, no markdown):
{"status":"decide"|"clarify","clarifying_questions":[],"recommendation":"...","user_preference_conflict":false,"why":"...","spoken_advice":"...","options":[],"evaluation":[{"option":"...","score":7,"note":"..."}],"confidence":0.7,"transcript":"","profile_update":""}
why ≤2 sentences; spoken_advice 1 sentence; options ≤3; evaluation ≤2.${profileSection}${prefsSection}`;
}

export function buildDecideUserPrompt(args: {
  textSituation?: string;
  history: HistoryTurn[];
  hasAudio: boolean;
  factsJson?: string;
  intent?: string;
  amendIntent?: "push_back" | "add_fact" | "go_deeper";
}): string {
  const parts: string[] = [];

  if (args.hasAudio && !args.textSituation?.trim()) {
    parts.push("Voice attached (transcript may be partial).");
  }
  if (args.textSituation?.trim()) {
    parts.push(`Current situation:\n${clip(args.textSituation, SITUATION_MAX)}`);
  }

  if (args.amendIntent === "push_back") {
    parts.push(
      "Amend mode: the user is pushing back on your last recommendation. Take the objection seriously and revise the call if warranted — do not dig in just to defend the prior pick."
    );
  } else if (args.amendIntent === "add_fact") {
    parts.push(
      "Amend mode: the user is adding a fact that may change the call. Fold it into the argument and update the recommendation if it flips #1."
    );
  } else if (args.amendIntent === "go_deeper") {
    parts.push(
      "Amend mode: the user wants more depth on the same decision. Keep the same recommendation unless new info flips it; expand why, tradeoffs, and next steps."
    );
  }

  const history = args.history.slice(-HISTORY_MAX_TURNS);
  if (history.length > 0) {
    parts.push(
      `Recent conversation:\n${history
        .map(
          (t) =>
            `${t.role === "user" ? "User" : "Megamind"}: ${clip(t.text, TURN_MAX)}`
        )
        .join("\n")}`
    );
  }

  if (args.factsJson?.trim()) {
    parts.push(
      `Verified facts to ground your answer (use the numbers, times, and place names; do not invent). Never mention how the facts were gathered — no “lookup showed,” “travel times say,” etc.:\n${clip(args.factsJson, 7500)}`
    );
  } else if (args.intent && args.intent !== "skip") {
    parts.push(
      "No live facts were retrieved for this turn. Be honest about uncertainty, use careful common sense, or clarify — invent no numbers."
    );
  }

  parts.push(
    "Return ONE valid JSON object only. User-facing strings must be plain language with no internal system vocabulary."
  );
  return parts.join("\n\n");
}

export function buildProfileMergePrompt(
  currentSummary: string,
  newNotes: string[]
): string {
  return `Merge durable Megamind profile facts only. Max 80 words. Text only.

Now:
${clip(currentSummary, PROFILE_MAX) || "(empty)"}

Add:
${newNotes.map((n) => `- ${clip(n, 120)}`).join("\n")}`;
}

const KIND_LABELS = [...new Set(Object.values(FACT_KIND_LABEL))];
const KIND_ALT = KIND_LABELS.map((l) => l.replace(/\s+/g, "\\s+")).join("|");

/**
 * Strip internal agent vocabulary that sometimes leaks into user-facing copy.
 * Prefer phrase rewrites over blunt word swaps so English stays readable.
 */
export function sanitizeUserFacingText(text: string): string {
  if (!text) return text;
  let s = text;

  const toolNames = Object.keys(FACT_KIND_LABEL).sort(
    (a, b) => b.length - a.length
  );
  for (const name of toolNames) {
    const label = FACT_KIND_LABEL[name];
    const re = new RegExp(`\\b${name.replace(/_/g, "[_\\s]?")}\\b`, "gi");
    s = s.replace(re, label);
  }

  s = s
    // Cite-the-pipeline phrasing → plain grounding
    .replace(
      new RegExp(
        `\\b(?:per|via|from|according\\s+to)\\s+(?:the\\s+)?(?:${KIND_ALT})(?:\\s+and\\s+(?:the\\s+)?(?:${KIND_ALT}))*\\b`,
        "gi"
      ),
      "from what I found"
    )
    .replace(
      new RegExp(
        `\\b(?:the\\s+)?(?:${KIND_ALT})\\s+(?:show(?:s|ed)?|indicate[sd]?|suggest(?:s|ed)?|say(?:s|ing)?)\\b`,
        "gi"
      ),
      "the numbers show"
    )
    .replace(
      /\b(?:this|the|a)\s+tools?\s+(?:showed|shows|says|said|found)\b/gi,
      "I found"
    )
    .replace(/\bprefetched\b/gi, "looked-up")
    .replace(/\bprefetch(?:ed|ing)?\b/gi, "looked-up")
    .replace(/\bplaybooks?\b/gi, "")
    .replace(/\bintent\s*=\s*\w+\b/gi, "")
    .replace(/\b(?:classified|playbook)\s+intent\b/gi, "")
    .replace(/\buse\s+(?:disclosed\s+)?priors?\s*:?\s*/gi, "")
    .replace(/\b(?:disclosed\s+)?priors?\b/gi, "")
    .replace(/\bdefault leanings?\b/gi, "")
    .replace(/\btool facts?\b/gi, "facts")
    .replace(/\btool(?:\s+call|\s+result|\s+output)s?\b/gi, "lookup")
    .replace(/\bOpenRouter\b/gi, "")
    .replace(/\bLing(?:-?\d(?:\.\d)?(?:-flash)?)?\b/gi, "")
    .replace(/\bAgent-?Reach\b/gi, "")
    .replace(/\bAPIs?\b/g, "")
    .replace(/\bschemas?\b/gi, "")
    .replace(/\bJSON\b/g, "")
    .replace(/\bSSE\b/g, "")
    .replace(/\bNominatim\b/gi, "maps")
    .replace(/\bPhoton\b/gi, "maps")
    .replace(/\bOSRM\b/gi, "routing")
    .replace(/\bOverpass\b/gi, "map data")
    .replace(/\bTransitous\b/gi, "transit")
    .replace(/\bOpenAlex\b/gi, "research")
    .replace(/\bCoinGecko\b/gi, "market data")
    .replace(/\bFrankfurter\b/gi, "exchange rates")
    .replace(/\bExa\b/gi, "search")
    .replace(/\bJina\b/gi, "page read")
    .replace(
      /\b(?:per|via|from|according\s+to)\s+(?:routing|maps|transit|map data|search|page read|research|market data|exchange rates)(?:\s+and\s+(?:routing|maps|transit|map data|search|page read|research|market data|exchange rates))*\b/gi,
      "from what I found"
    )
    .replace(/\bverified (?:holiday )?data\b/gi, "the numbers")
    .replace(/\bverified headlines\b/gi, "today's headlines")
    .replace(/\bthe verified data shows\b/gi, "recent figures show")
    .replace(
      /\b(?:the\s+)?(?:looked-up\s+)?(?:search\s+results?|web\s+search(?:\s+results?)?|lookups?)\s+(?:consistently\s+)?(?:say|show|suggest|indicate|flag|flags|point|points)\b/gi,
      "common advice is"
    )
    .replace(
      /\bwhat I found\s+(?:consistently\s+)?(?:say|show|suggest|indicate|flag|flags|point|points)\b/gi,
      "common advice is"
    )
    .replace(/\b(?:the\s+)?search results?\b/gi, "recent guidance")
    .replace(/\bOpen-?Meteo\b/gi, "weather")
    .replace(/\bOSM\b/g, "map data")
    .replace(/\bconfidence(?:\s+score)?\b/gi, "certainty")
    .replace(/\b\d{1,3}%\s*(?:confidence|certainty)\b/gi, "")
    .replace(/\bmoney_anxiety\b/gi, "money stress")
    .replace(/\brisk_tolerance\b/gi, "risk comfort")
    .replace(/\bdefault_tip(?:_pct)?\b/gi, "usual tip")
    .replace(
      /\buser_preference_conflict\b/gi,
      "different from what you preferred"
    )
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/^[,;:\s]+/, "")
    .trim();

  return s;
}

/** JSON Schema for prompts/docs — not forced via response_format (Ling). */
export const decideResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "clarifying_questions",
    "recommendation",
    "user_preference_conflict",
    "why",
    "spoken_advice",
    "options",
    "evaluation",
    "confidence",
    "transcript",
    "profile_update",
  ],
  properties: {
    status: { type: "string", enum: ["decide", "clarify"] },
    clarifying_questions: { type: "array", items: { type: "string" } },
    recommendation: { type: "string" },
    user_preference_conflict: { type: "boolean" },
    why: { type: "string" },
    spoken_advice: { type: "string" },
    options: { type: "array", items: { type: "string" } },
    evaluation: {
      type: "array",
      items: {
        type: "object",
        properties: {
          option: { type: "string" },
          score: { type: "number" },
          note: { type: "string" },
        },
      },
    },
    confidence: { type: "number" },
    transcript: { type: "string" },
    profile_update: { type: "string" },
  },
};
