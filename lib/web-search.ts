/**
 * Web search — Exa primary (EXA_API_KEY), DuckDuckGo/Jina fallback.
 * Exposed both as a library helper and as a Gemini function-calling tool.
 */

import { Type, type FunctionDeclaration } from "@google/genai";
import { getExaApiKey } from "./config";

export type SearchHit = {
  title: string;
  snippet: string;
  url?: string;
};

export type WebSearchBundle = {
  query: string;
  hits: SearchHit[];
  /** Wall time for the search attempt. */
  tookMs: number;
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Gemini tool declaration — model calls this when external facts could flip the ranking. */
export const webSearchFunctionDeclaration: FunctionDeclaration = {
  name: "web_search",
  description:
    "Web search for live facts (prices, norms, rates, laws, averages, news). Call at most once per turn when a fact could change the recommendation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          "Short factual search query (e.g. 'US restaurant tip percentage 2025 average').",
      },
    },
    required: ["query"],
  },
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

/**
 * Heuristic: should we *offer* the web_search tool this turn?
 * (Avoids a wasted tool-round LLM call on pure personal preference.)
 */
export function shouldOfferWebSearchTool(text: string | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t) return true; // audio / unknown — let the model choose
  if (t.length < 12) return false;
  if (
    /\b(should i text|ex\b|apologize|break up|propose|feel|anxious|guilt)\b/i.test(
      t
    ) &&
    !/\b(law|legal|salary|price|rate|tax|average|market|cost|percent|%|202[4-9])\b/i.test(
      t
    )
  ) {
    return false;
  }
  return (
    /\b(price|cost|how much|salary|wage|rent|mortgage|interest|rate|tax|tip(?:ping)?|average|median|statistic|study|research|law|legal|FDA|CDC|IRS|market|stock|crypto|news|current|today|202[4-9]|vs\.?|versus|compare|official|guidelines?|policy|fee|insurance|norm|standard)\b/i.test(
      t
    ) || /\d+\s*%|\b\$\d/.test(t)
  );
}

/** @deprecated use shouldOfferWebSearchTool */
export const shouldWebSearch = shouldOfferWebSearchTool;

export function buildSearchQuery(text: string): string {
  return text
    .replace(/\b(should i|do i|would you|please|um+|uh+)\b/gi, " ")
    .replace(/[?!]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function instantAnswer(
  query: string,
  timeoutMs: number
): Promise<SearchHit[]> {
  const url =
    "https://api.duckduckgo.com/?" +
    new URLSearchParams({
      q: query,
      format: "json",
      no_html: "1",
      skip_disambig: "1",
    }).toString();

  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/json", "User-Agent": UA } },
    timeoutMs
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    Answer?: string;
    RelatedTopics?: Array<
      { Text?: string; FirstURL?: string } | { Topics?: unknown }
    >;
  };

  const hits: SearchHit[] = [];
  if (data.AbstractText?.trim()) {
    hits.push({
      title: data.Heading?.trim() || "DuckDuckGo",
      snippet: data.AbstractText.trim().slice(0, 220),
      url: data.AbstractURL || undefined,
    });
  }
  if (data.Answer?.trim()) {
    hits.push({
      title: "Answer",
      snippet: stripTags(data.Answer).slice(0, 220),
    });
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (hits.length >= 3) break;
    if ("Text" in topic && topic.Text) {
      hits.push({
        title: stripTags(topic.Text).slice(0, 80),
        snippet: stripTags(topic.Text).slice(0, 220),
        url: topic.FirstURL,
      });
    }
  }
  return hits;
}

async function htmlResults(
  query: string,
  timeoutMs: number,
  limit: number
): Promise<SearchHit[]> {
  const res = await fetchWithTimeout(
    "https://html.duckduckgo.com/html/?" +
      new URLSearchParams({ q: query }).toString(),
    {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": UA,
      },
    },
    timeoutMs
  );
  if (!res.ok) return [];
  const html = await res.text();
  if (!html.includes("result__a")) return liteResults(query, timeoutMs, limit);

  const hits: SearchHit[] = [];
  const re =
    /class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && hits.length < limit) {
    const title = stripTags(m[2]).slice(0, 100);
    const snippet = stripTags(m[3]).slice(0, 200);
    if (!title || !snippet) continue;
    let url = m[1];
    const uddg = /[?&]uddg=([^&]+)/.exec(url);
    if (uddg) {
      try {
        url = decodeURIComponent(uddg[1]);
      } catch {
        /* keep raw */
      }
    }
    hits.push({ title, snippet, url });
  }
  return hits;
}

async function liteResults(
  query: string,
  timeoutMs: number,
  limit: number
): Promise<SearchHit[]> {
  const res = await fetchWithTimeout(
    "https://lite.duckduckgo.com/lite/?" +
      new URLSearchParams({ q: query }).toString(),
    {
      method: "GET",
      headers: {
        Accept: "text/html",
        "User-Agent": UA,
      },
    },
    timeoutMs
  );
  if (!res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  const re =
    /class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result-snippet">([\s\S]*?)<\/td>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && hits.length < limit) {
    const title = stripTags(m[2]).slice(0, 100);
    const snippet = stripTags(m[3]).slice(0, 200);
    if (!title || !snippet) continue;
    hits.push({ title, snippet, url: m[1] });
  }
  return hits;
}

/**
 * Primary search entry — Exa when keyed, else DuckDuckGo race.
 */
export async function webSearch(
  query: string,
  opts?: {
    limit?: number;
    timeoutMs?: number;
    allowWikiFallback?: boolean;
    preferNumeric?: boolean;
  }
): Promise<WebSearchBundle> {
  const q = query.trim().slice(0, 160);
  if (!q) return { query: q, hits: [], tookMs: 0 };

  const cacheKey = `${q}|${opts?.limit ?? 4}|${opts?.preferNumeric ? 1 : 0}`;
  const cached = searchCacheGet(cacheKey);
  if (cached) return { ...cached, tookMs: 0 };

  const key = getExaApiKey();
  if (key) {
    // Race Exa vs DDG — take Exa if it returns hits; otherwise keep DDG without waiting for a dead Exa beyond budget.
    const exaBudget = Math.min(opts?.timeoutMs ?? 2200, 1800);
    const exaP = exaSearch(q, key, { ...opts, timeoutMs: exaBudget }).catch(
      (err) => {
        console.warn(
          "[web_search] Exa failed:",
          err instanceof Error ? err.message : err
        );
        return { query: q, hits: [] as SearchHit[], tookMs: 0 } satisfies WebSearchBundle;
      }
    );
    const ddgP = duckDuckGoSearch(q, opts);

    const exaFirst = await Promise.race([
      exaP.then((b) =>
        b.hits.length > 0 ? ({ kind: "exa" as const, b }) : null
      ),
      sleep(exaBudget + 50).then(() => null),
    ]);
    if (exaFirst?.kind === "exa") {
      searchCacheSet(cacheKey, exaFirst.b);
      return exaFirst.b;
    }

    const [exa, ddg] = await Promise.all([exaP, ddgP]);
    if (exa.hits.length > 0) {
      searchCacheSet(cacheKey, exa);
      return exa;
    }
    if (ddg.hits.length > 0) {
      console.warn(`[web_search] Exa empty for q="${q}", using DDG`);
      searchCacheSet(cacheKey, ddg);
      return ddg;
    }
    return { query: q, hits: [], tookMs: Math.max(exa.tookMs, ddg.tookMs) };
  }

  const fallback = await duckDuckGoSearch(q, opts);
  if (fallback.hits.length > 0) searchCacheSet(cacheKey, fallback);
  return fallback;
}

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_CACHE_MAX = 200;
const searchCache = new Map<string, { at: number; bundle: WebSearchBundle }>();

function searchCacheGet(key: string): WebSearchBundle | null {
  const row = searchCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > SEARCH_CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  // LRU: re-insert as newest
  searchCache.delete(key);
  searchCache.set(key, { at: Date.now(), bundle: row.bundle });
  return row.bundle;
}

function searchCacheSet(key: string, bundle: WebSearchBundle): void {
  if (searchCache.has(key)) searchCache.delete(key);
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(key, { at: Date.now(), bundle });
}

async function exaSearch(
  query: string,
  apiKey: string,
  opts?: {
    limit?: number;
    timeoutMs?: number;
    preferNumeric?: boolean;
  }
): Promise<WebSearchBundle> {
  const limit = opts?.limit ?? 4;
  const timeoutMs = opts?.timeoutMs ?? 2200;
  const started = Date.now();
  const res = await fetchWithTimeout(
    "https://api.exa.ai/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        type: "fast",
        numResults: limit,
        contents: { highlights: true },
      }),
    },
    timeoutMs
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Exa HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      text?: string;
      highlights?: string[];
      summary?: string;
    }>;
  };
  let hits: SearchHit[] = (data.results || [])
    .map((r) => {
      const snippet = (
        r.highlights?.join(" ") ||
        r.summary ||
        r.text ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
      const title = (r.title || "").trim().slice(0, 120);
      if (!title || snippet.length < 8) return null;
      return { title, snippet, url: r.url };
    })
    .filter(Boolean) as SearchHit[];

  if (opts?.preferNumeric) {
    hits = [...hits].sort((a, b) => moneyHitScore(b) - moneyHitScore(a));
  }
  hits = hits.slice(0, limit);
  return { query, hits, tookMs: Date.now() - started };
}

/**
 * DuckDuckGo fallback. Direct HTML is often bot-challenged; Jina-fetched DDG lite
 * runs in parallel. Wikipedia is last resort.
 */
export async function duckDuckGoSearch(
  query: string,
  opts?: {
    limit?: number;
    timeoutMs?: number;
    allowWikiFallback?: boolean;
    preferNumeric?: boolean;
  }
): Promise<WebSearchBundle> {
  const limit = opts?.limit ?? 3;
  const timeoutMs = opts?.timeoutMs ?? 1200;
  const allowWiki = opts?.allowWikiFallback !== false;
  const preferNumeric = opts?.preferNumeric === true;
  const q = query.trim().slice(0, 160);
  const started = Date.now();
  if (!q) return { query: q, hits: [], tookMs: 0 };

  const jinaBudget = Math.min(Math.max(timeoutMs, 900), 1500);
  const legBudget = Math.min(1100, Math.max(700, Math.floor(timeoutMs * 0.55)));
  const pool: SearchHit[] = [];
  let resolveEarly!: (hits: SearchHit[]) => void;
  const early = new Promise<SearchHit[]>((r) => {
    resolveEarly = r;
  });
  let settled = false;

  const rankHits = (hits: SearchHit[]) => {
    const filtered = dedupeHits(
      hits.filter((h) => !/^(tipped wage|mcdonald'?s?)$/i.test(h.title.trim())),
      limit * 4
    );
    if (!preferNumeric) return filtered.slice(0, limit);
    return [...filtered]
      .sort((a, b) => moneyHitScore(b) - moneyHitScore(a))
      .slice(0, limit);
  };

  const consider = (incoming: SearchHit[]) => {
    if (!incoming.length) return;
    pool.push(...incoming);
    const ranked = rankHits(pool);
    const ready = preferNumeric
      ? ranked.some((h) => moneyHitScore(h) >= 2) && ranked.length >= 1
      : ranked.length >= Math.min(2, limit);
    if (!settled && ready) {
      settled = true;
      resolveEarly(ranked);
    }
  };

  const all = Promise.all([
    instantAnswer(q, legBudget)
      .catch(() => [] as SearchHit[])
      .then((h) => {
        consider(h);
        return h;
      }),
    htmlResults(q, legBudget, limit)
      .catch(() => [] as SearchHit[])
      .then((h) => {
        consider(h);
        return h;
      }),
    jinaDuckDuckGoLite(q, limit, jinaBudget)
      .catch(() => [] as SearchHit[])
      .then((h) => {
        consider(h);
        return h;
      }),
  ]).then(([instant, html, jina]) => rankHits([...jina, ...instant, ...html]));

  void all.then((hits) => {
    if (!settled) {
      settled = true;
      resolveEarly(hits);
    }
  });

  let merged = await Promise.race([
    early,
    sleep(jinaBudget + 80).then(() => rankHits(pool)),
  ]);
  settled = true;

  if (merged.length === 0 && allowWiki) {
    merged = await wikipediaFallback(q, limit).catch(() => [] as SearchHit[]);
  }

  return { query: q, hits: merged, tookMs: Date.now() - started };
}

function moneyHitScore(h: SearchHit): number {
  const text = `${h.title} ${h.snippet}`;
  let s = 0;
  if (/%|percent|percentage/i.test(text)) s += 3;
  if (/\$|\d+(\.\d+)?/.test(text)) s += 2;
  if (/\b(tip|gratuity|average|norm|salary|wage|price)\b/i.test(text)) s += 1;
  if (/wikipedia|wiki/i.test(h.url || h.title)) s -= 2;
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function dedupeHits(hits: SearchHit[], limit: number): SearchHit[] {
  const merged: SearchHit[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = hit.title.toLowerCase().slice(0, 40);
    if (!hit.title || !hit.snippet || seen.has(key)) continue;
    seen.add(key);
    merged.push(hit);
    if (merged.length >= limit) break;
  }
  return merged;
}

/**
 * Fetch DDG lite through r.jina.ai markdown proxy when direct HTML is challenged.
 */
async function jinaDuckDuckGoLite(
  query: string,
  limit: number,
  timeoutMs: number
): Promise<SearchHit[]> {
  const target =
    "http://lite.duckduckgo.com/lite/?" +
    new URLSearchParams({ q: query }).toString();
  const res = await fetchWithTimeout(
    "https://r.jina.ai/" + encodeURI(target),
    {
      method: "GET",
      headers: {
        Accept: "text/plain",
        "User-Agent": UA,
      },
    },
    timeoutMs
  );
  if (!res.ok) return [];
  const md = await res.text();
  if (/challenge|anomaly|captcha/i.test(md) && !/average|tip|percent|\$/i.test(md)) {
    return [];
  }
  return parseJinaDdgMarkdown(md, limit);
}

function parseJinaDdgMarkdown(md: string, limit: number): SearchHit[] {
  const hits: SearchHit[] = [];
  const clean = (s: string) =>
    stripTags(s).replace(/\*\*/g, "").replace(/\s+/g, " ").trim();

  // 1.[Title](url) followed by snippet until next numbered result
  const re =
    /(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)\s*([\s\S]*?)(?=\n\d+\.\s*\[|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null && hits.length < limit) {
    const title = clean(m[2]).slice(0, 100);
    const snippet = clean(m[4]).slice(0, 220);
    if (!title || snippet.length < 12) continue;
    hits.push({ title, snippet, url: m[3] });
  }
  if (hits.length > 0) return hits;

  const re2 =
    /##\s*\[([^\]]+)\]\(([^)]+)\)\s*([\s\S]*?)(?=\n##\s*\[|$)/g;
  while ((m = re2.exec(md)) !== null && hits.length < limit) {
    const title = clean(m[1]).slice(0, 100);
    const snippet = clean(m[3]).slice(0, 220);
    if (!title || snippet.length < 12) continue;
    hits.push({ title, snippet, url: m[2] });
  }
  return hits;
}

/** Last-resort free facts from Wikipedia search extracts. */
async function wikipediaFallback(
  query: string,
  limit: number
): Promise<SearchHit[]> {
  const url =
    "https://en.wikipedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrsearch: query,
      gsrlimit: String(limit),
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      exchars: "220",
      format: "json",
      origin: "*",
    }).toString();
  const res = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/json", "User-Agent": UA } },
    1200
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { pages?: Record<string, { title?: string; extract?: string; index?: number }> };
  };
  const pages = Object.values(data.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 0) - (b.index ?? 0)
  );
  return pages
    .filter((p) => p.title && p.extract)
    .slice(0, limit)
    .map((p) => ({
      title: p.title!,
      snippet: p.extract!.slice(0, 220),
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title!.replace(/ /g, "_"))}`,
    }));
}

/** Execute the Gemini web_search tool; returns a compact object for functionResponse. */
export async function executeWebSearchTool(args: {
  query?: unknown;
  limit?: unknown;
  timeoutMs?: unknown;
  preferNumeric?: unknown;
}): Promise<{
  output: {
    query: string;
    hits: { title: string; snippet: string; url?: string }[];
    tookMs: number;
    note?: string;
  };
  sources: { title: string }[];
}> {
  let query = String(args.query ?? "").trim().slice(0, 160);
  query = boostSearchQuery(query);
  const moneyLike =
    args.preferNumeric === true ||
    (args.preferNumeric !== false &&
      /\b(tip|tips|tipping|gratuity|salary|wage|price|cost|tax|fee|percent|stock|bitcoin|crypto)\b/i.test(
        query
      ));
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? Math.max(1, Math.min(6, Math.floor(args.limit)))
      : 4;
  const timeoutMs =
    typeof args.timeoutMs === "number" && Number.isFinite(args.timeoutMs)
      ? Math.max(800, Math.min(4000, Math.floor(args.timeoutMs)))
      : 2200;
  const bundle = await webSearch(query, {
    limit,
    timeoutMs,
    allowWikiFallback: !moneyLike,
    preferNumeric: moneyLike,
  });
  if (bundle.hits.length === 0) {
    console.warn(`[web_search] no hits for q="${query}" took=${bundle.tookMs}ms`);
  }
  return {
    output: {
      query: bundle.query,
      hits: bundle.hits.map((h) => ({
        title: h.title,
        snippet: h.snippet,
        ...(h.url ? { url: h.url } : {}),
      })),
      tookMs: bundle.tookMs,
      ...(bundle.hits.length === 0
        ? { note: "No results — decide without invented numbers; clarify if needed." }
        : {}),
    },
    sources: bundle.hits.map((h) => ({ title: h.title })),
  };
}

/** Context-aware tip / money query rewrite — avoid always forcing sit-down US. */
function boostSearchQuery(query: string): string {
  if (/\btipping\s+point\b/i.test(query)) return query;
  if (!/\btip/i.test(query)) return query;
  if (/percent|average|202[4-9]|gratuity norm/i.test(query)) return query;
  if (/\b(delivery|doordash|uber\s*eats|grubhub)\b/i.test(query)) {
    return `${query} tip percentage delivery app 2024`.slice(0, 160);
  }
  if (/\b(uber|lyft|taxi|rideshare|cab)\b/i.test(query)) {
    return `${query} tip percentage rideshare driver 2024`.slice(0, 160);
  }
  if (/\b(barista|coffee|cafe)\b/i.test(query)) {
    return `${query} tip percentage coffee shop barista`.slice(0, 160);
  }
  if (/\b(hotel|housekeep|bellhop)\b/i.test(query)) {
    return `${query} tip percentage hotel housekeeping`.slice(0, 160);
  }
  if (
    /\b(uk|britain|england|europe|japan|canada|australia|france|germany)\b/i.test(
      query
    )
  ) {
    return `${query} tipping customs percentage`.slice(0, 160);
  }
  return `${query} tip percentage average restaurant United States 2024`.slice(
    0,
    160
  );
}

/** Compact text block (legacy / logging). */
export function formatSearchForPrompt(bundle: WebSearchBundle | null): string {
  if (!bundle || bundle.hits.length === 0) return "";
  const lines = bundle.hits.map(
    (h, i) => `${i + 1}. ${h.title} — ${h.snippet}`
  );
  const body = lines.join("\n").slice(0, 700);
  return `Web (q="${bundle.query}"):\n${body}`;
}
