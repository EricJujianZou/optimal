/**
 * Megamind agent tools — only what flips real life decisions.
 *
 * Offered: reach_search, reach_read, reach_rss, wikipedia, geocode, plan_trip,
 *          find_nearby, weather, get_current_time, public_holidays,
 *          scholar_search, unit_convert, calculate, forex_rate
 *
 * Internet reach (Agent-Reach style): lib/agent-reach.ts
 * Pruned: web_search, multi_search, fetch_page, nearby_places, crypto_price
 * Internal only: route, route_compare, plan_transit, nearby_places
 */

import { reachRead, reachRss, reachSearch } from "./agent-reach";
import { webSearch } from "./web-search";

export type ToolSource = { title: string; kind?: string };

export type ToolExecution = {
  output: unknown;
  sources: ToolSource[];
};

type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const UA =
  "Mozilla/5.0 (compatible; Megamind/1.0; +https://localhost; decision-research)";
const OPENALEX_MAILTO = "megamind@localhost";
const MAX_TOOLS_OFFERED = 5;
const GEOCODE_CACHE_TTL_MS = 15 * 60 * 1000;
const GEOCODE_CACHE_MAX = 300;
/** Interval between Nominatim request *starts* (usage policy ≈ 1/s). Photon is preferred. */
const NOMINATIM_GAP_MS = 850;

/** Nominatim policy ≈ 1 req/s — serialize; gap measured from previous start. */
let nominatimGate: Promise<unknown> = Promise.resolve();
let lastNominatimStart = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withNominatimSlot<T>(fn: () => Promise<T>): Promise<T> {
  const run = async () => {
    const wait = Math.max(0, NOMINATIM_GAP_MS - (Date.now() - lastNominatimStart));
    if (wait > 0) await sleep(wait);
    lastNominatimStart = Date.now();
    return await fn();
  };
  const p = nominatimGate.then(run, run);
  nominatimGate = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

const geocodeCache = new Map<
  string,
  { at: number; execution: ToolExecution }
>();

/** Best-effort IANA timezone from free text (US-centric place names). */
export function inferTimezone(text?: string | null): string | undefined {
  const t = (text ?? "").toLowerCase();
  if (!t) return undefined;
  // Check specific zones before broader Pacific list (phoenix ≠ LA).
  if (/\b(phoenix|tucson)\b/.test(t)) return "America/Phoenix";
  if (/\b(denver|salt lake|boulder)\b/.test(t)) return "America/Denver";
  if (
    /\b(sf\b|san francisco|oakland|berkeley|san jose|palo alto|seattle|portland|los angeles|\bla\b|san diego|sacramento|las vegas)\b/.test(
      t
    )
  ) {
    return "America/Los_Angeles";
  }
  if (
    /\b(nyc|new york|boston|philadelphia|miami|atlanta|washington.?dc|dc\b)\b/.test(
      t
    )
  ) {
    return "America/New_York";
  }
  if (/\b(chicago|dallas|houston|austin|minneapolis)\b/.test(t)) {
    return "America/Chicago";
  }
  if (/\b(london|manchester|edinburgh)\b/.test(t)) return "Europe/London";
  if (/\b(paris|berlin|amsterdam|madrid|rome)\b/.test(t)) return "Europe/Paris";
  if (/\b(tokyo|osaka)\b/.test(t)) return "Asia/Tokyo";
  if (/\b(sydney|melbourne)\b/.test(t)) return "Australia/Sydney";
  // US tip / bank / generic US context → Eastern is wrong for SF; leave unset
  if (/\b(united states|\busa\b|\bu\.s\.\b)\b/.test(t) && !/\b(evening|tonight|now|hours|open)\b/.test(t)) {
    return undefined;
  }
  return undefined;
}

function withInferredTimezone(
  args: Record<string, unknown>,
  inferred?: string
): Record<string, unknown> {
  if (args.timezone || !inferred) return args;
  return { ...args, timezone: inferred };
}

async function fetchJson(
  url: string,
  timeoutMs = 2500,
  init?: RequestInit
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        ...(init?.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Offered catalog — route/route_compare/plan_transit/nearby_places are internal. */
export const openRouterTools: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "reach_search",
      description:
        "Live web search (Exa / Agent-Reach search channel). Pass query or queries (1–2) for parallel angles.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Single search query" },
          queries: {
            type: "array",
            items: { type: "string" },
            description: "1–2 short queries in parallel",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reach_read",
      description:
        "Read a URL via Agent-Reach routing: Jina web, GitHub API/gh, YouTube, Reddit JSON, V2EX API, LinkedIn/X via Jina.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reach_rss",
      description:
        "Read an RSS/Atom feed URL (headlines + links). Use when the user names a feed or newsroom RSS.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wikipedia",
      description:
        "Encyclopedia summary for a known title. On miss, returns search candidates.",
      parameters: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "geocode",
      description:
        "Place → lat/lon + hours/phone if OSM-tagged. For A→B use plan_trip instead.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_trip",
      description:
        "ONE call for walk/Uber/drive/transit: geocode + road times + transit + weather.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          include_cycling: { type: "boolean" },
          include_weather: { type: "boolean", description: "Default true" },
          include_transit: { type: "boolean", description: "Default true" },
          timezone: { type: "string", description: "IANA tz" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nearby",
      description:
        "ONE call for 'coffee/pharmacy near X': geocode place + OSM nearby + local time/open_now.",
      parameters: {
        type: "object",
        properties: {
          near: {
            type: "string",
            description: "Anchor place, e.g. 'Ferry Building San Francisco'",
          },
          lat: { type: "number", description: "Optional client latitude" },
          lon: { type: "number", description: "Optional client longitude" },
          kind: {
            type: "string",
            description:
              "cafe|restaurant|pharmacy|supermarket|bank|hospital|bar|fuel|atm|library",
          },
          radius_m: { type: "number", description: "Default 500, max 1000" },
          timezone: { type: "string", description: "IANA tz for open_now" },
        },
        required: ["near"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weather",
      description:
        "Forecast + sunrise/sunset. Needs lat/lon. Skip if plan_trip already ran.",
      parameters: {
        type: "object",
        properties: { lat: { type: "number" }, lon: { type: "number" } },
        required: ["lat", "lon"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Local clock in an IANA timezone (tonight / open-now / deadlines).",
      parameters: {
        type: "object",
        properties: { timezone: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "public_holidays",
      description: "Upcoming public/bank holidays by country (Nager.Date).",
      parameters: {
        type: "object",
        properties: {
          country: { type: "string" },
          year: { type: "number" },
        },
        required: ["country"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scholar_search",
      description: "Research papers (OpenAlex) for health/evidence claims.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unit_convert",
      description: "Temp/length/mass/volume convert (local).",
      parameters: {
        type: "object",
        properties: {
          value: { type: "number" },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["value", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "forex_rate",
      description: "FX rate via Frankfurter (ECB). e.g. USD→EUR.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO currency e.g. USD" },
          to: { type: "string", description: "ISO currency e.g. EUR" },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description: "Safe arithmetic: tips, splits, affordability.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string" } },
        required: ["expression"],
      },
    },
  },
];

const OFFER_PRIORITY = [
  "plan_trip",
  "find_nearby",
  "reach_search",
  "forex_rate",
  "calculate",
  "geocode",
  "get_current_time",
  "weather",
  "public_holidays",
  "scholar_search",
  "wikipedia",
  "reach_read",
  "reach_rss",
  "unit_convert",
];

/** Offer ≤5 tools that flip this decision — fewer schemas = better + faster picks. */
export function selectOpenRouterTools(situation?: string): ToolDef[] {
  const t = (situation ?? "").toLowerCase();
  const want = new Set<string>();
  const add = (...names: string[]) => names.forEach((n) => want.add(n));

  const isCommute =
    /\b(walk|drive|uber|lyft|taxi|commute|directions|bike|transit|bus|train|bart|subway|metro|from .+ to|how long|distance|miles?|km\b)\b/.test(
      t
    );
  const isNearby =
    /\b(nearby|near me|open now|closest|around here)\b/.test(t) ||
    (/\b(cafe|coffee|pharmacy|drugstore|supermarket|grocery|atm|bar)\b/.test(
      t
    ) &&
      /\b(near|at the|i'?m at|i am at|which|where)\b/.test(t));
  const isWeatherOnly =
    /\b(weather|rain|storm|snow|forecast|hot|cold|sunset|sunrise)\b/.test(t) &&
    !isCommute;
  // Avoid mother-in-law / "split up" / bare "100 percent sure" false positives.
  const isMoney =
    /\b(tip|tips|tipping|gratuity|price|cost|salary|wage|legal advice|lawsuit|court|attorney|statute|average|median|norm|tax|fee|insurance|afford|budget|split the bill|bill split)\b/.test(
      t
    ) ||
    (/\d+\s*%/.test(t) &&
      /\b(tip|tax|interest|fee|raise|discount|apr|rate)\b/.test(t)) ||
    /\b\$\d/.test(t);
  const isForex =
    /\b(forex|exchange rate|usd to|eur to|gbp to|yen|currency convert)\b/.test(
      t
    );
  const isHealth =
    /\b(study|studies|research|evidence|meta-?analysis|peer-?reviewed|clinical|side.?effect|supplement|vaccine|healthy|healthier|symptom|diagnosis|is .+ better|should i (walk|run|exercise|take|eat))\b/.test(
      t
    );
  const isEntity =
    /\b(what is|who is|explain|meaning of|history of|define)\b/.test(t);
  const isNews =
    /\b(news|headline|breaking|today'?s news|current events|stock|market|election|poll)\b/.test(
      t
    );
  const isHoliday =
    /\b(holiday|bank holiday|memorial day|labor day|christmas|thanksgiving|new year'?s?|banks? open)\b/.test(
      t
    );
  const wantsFareOrDelay =
    /\b(cost|price|fare|surge|cheap|expensive|delay|traffic|strike|cancelled)\b/.test(
      t
    );
  const wantsFeed =
    /\b(rss|atom feed|subscribe to (the )?feed|news feed)\b/.test(t);
  const wantsUrlRead =
    /\bhttps?:\/\//.test(t) ||
    /\b(youtube\.com|youtu\.be|github\.com|reddit\.com|v2ex\.com|linkedin\.com)\b/i.test(
      t
    );

  // Money before nearby — "restaurant bill tip" must not become find_nearby.
  if (isForex) {
    add("forex_rate", "calculate", "reach_search");
  } else if (isMoney && !isCommute) {
    add("reach_search", "calculate");
  } else if (isCommute) {
    add("plan_trip");
    if (wantsFareOrDelay || isMoney) add("reach_search");
  } else if (isNearby) {
    add("find_nearby");
  } else if (isWeatherOnly) {
    add("geocode", "weather", "get_current_time");
  } else if (isHealth) {
    add("scholar_search", "reach_search");
  } else if (wantsFeed) {
    add("reach_rss", "reach_search", "get_current_time");
  } else if (wantsUrlRead) {
    add("reach_read", "reach_search", "wikipedia");
  } else if (isNews) {
    add("reach_search", "reach_read", "get_current_time");
  } else if (isEntity) {
    add("wikipedia", "reach_search", "reach_read");
  } else if (isHoliday) {
    add("public_holidays", "get_current_time", "reach_search");
  } else if (
    /\b(convert|celsius|fahrenheit|\bkg\b|\blbs?\b|miles? to|km to)\b/.test(t)
  ) {
    add("unit_convert", "calculate");
  } else {
    add("reach_search", "wikipedia", "calculate");
  }

  const ranked = OFFER_PRIORITY.filter((n) => want.has(n)).slice(
    0,
    MAX_TOOLS_OFFERED
  );
  const selected = openRouterTools.filter((tool) =>
    ranked.includes(tool.function.name)
  );
  return selected.length > 0 ? selected : openRouterTools.slice(0, 4);
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineKm(lat1, lon1, lat2, lon2) * 1000;
}

const DAY_IDX: Record<string, number> = {
  su: 0,
  mo: 1,
  tu: 2,
  we: 3,
  th: 4,
  fr: 5,
  sa: 6,
};

/** Best-effort OSM opening_hours → open_now (common patterns only). */
function evalOpeningHours(
  rule: string | undefined,
  timezone?: string
): { open_now?: boolean; note?: string } {
  if (!rule) return {};
  const r = rule.trim();
  if (/^24\/7$/i.test(r)) return { open_now: true, note: "24/7" };

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const wd = (parts.find((p) => p.type === "weekday")?.value || "Mon")
      .slice(0, 2)
      .toLowerCase();
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const minute = Number(parts.find((p) => p.type === "minute")?.value);
    const mins = hour * 60 + minute;
    const today = DAY_IDX[wd];
    if (today == null || !Number.isFinite(mins)) {
      return { note: `hours: ${r}` };
    }

    // Split on ; for rules; take first matching day span
    for (const chunk of r.split(";").map((c) => c.trim()).filter(Boolean)) {
      const m =
        /^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i.exec(
          chunk
        );
      if (!m) continue;
      const a = DAY_IDX[m[1].toLowerCase()];
      const b = m[2] ? DAY_IDX[m[2].toLowerCase()] : a;
      if (a == null || b == null) continue;
      const inDay =
        a <= b ? today >= a && today <= b : today >= a || today <= b;
      if (!inDay) continue;
      const [sh, sm] = m[3].split(":").map(Number);
      const [eh, em] = m[4].split(":").map(Number);
      const start = sh * 60 + sm;
      let end = eh * 60 + em;
      if (end <= start) end += 24 * 60; // overnight
      const cur = mins < start && end > 24 * 60 ? mins + 24 * 60 : mins;
      return {
        open_now: cur >= start && cur < end,
        note: chunk,
      };
    }
    return { note: `hours: ${r}` };
  } catch {
    return { note: `hours: ${r}` };
  }
}

async function geocodePhoton(query: string): Promise<ToolExecution | null> {
  try {
    const expanded = expandPlaceQuery(query);
    const bias = cityBiasForQuery(expanded);
    const params = new URLSearchParams({ q: expanded, limit: "5" });
    if (bias) {
      params.set("lat", String(bias.lat));
      params.set("lon", String(bias.lon));
    }
    const url = "https://photon.komoot.io/api/?" + params.toString();
    const data = (await fetchJson(url, 1600)) as {
      features?: Array<{
        geometry?: { coordinates?: number[] };
        properties?: {
          name?: string;
          street?: string;
          housenumber?: string;
          city?: string;
          state?: string;
          country?: string;
          osm_value?: string;
        };
      }>;
    };
    const results = (data.features || [])
      .map((f) => {
        const coords = f.geometry?.coordinates;
        const lon = Number(coords?.[0]);
        const lat = Number(coords?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        const p = f.properties || {};
        const name = [p.name, p.housenumber, p.street, p.city, p.state, p.country]
          .filter(Boolean)
          .join(", ");
        return {
          name: name || expanded,
          lat,
          lon,
          type: p.osm_value,
          backend: "photon",
        };
      })
      .filter(Boolean) as Array<{
      name: string;
      lat: number;
      lon: number;
      type?: string;
      backend: string;
    }>;
    if (results.length === 0) return null;
    const ranked = bias
      ? [...results].sort(
          (a, b) =>
            haversineKm(a.lat, a.lon, bias.lat, bias.lon) -
            haversineKm(b.lat, b.lon, bias.lat, bias.lon)
        )
      : results;
    // Drop absurd far hits when we know the city (~120km)
    const filtered = bias
      ? ranked.filter(
          (r) => haversineKm(r.lat, r.lon, bias.lat, bias.lon) < 120
        )
      : ranked;
    const final = (filtered.length > 0 ? filtered : ranked).slice(0, 3);
    return {
      output: { query: expanded, results: final },
      sources: [{ title: final[0].name, kind: "maps" }],
    };
  } catch {
    return null;
  }
}

function expandPlaceQuery(query: string): string {
  return query
    .replace(/\bSF\b/gi, "San Francisco")
    .replace(/\bNYC\b/gi, "New York")
    .replace(/\bLA\b/g, "Los Angeles")
    .replace(/\s+/g, " ")
    .trim();
}

export function cityBiasForQuery(
  query: string
): { lat: number; lon: number } | null {
  const t = query.toLowerCase();
  if (/\bsan francisco\b/.test(t)) return { lat: 37.7749, lon: -122.4194 };
  if (/\bnew york\b/.test(t)) return { lat: 40.7128, lon: -74.006 };
  if (/\blos angeles\b/.test(t)) return { lat: 34.0522, lon: -118.2437 };
  if (/\bseattle\b/.test(t)) return { lat: 47.6062, lon: -122.3321 };
  if (/\bchicago\b/.test(t)) return { lat: 41.8781, lon: -87.6298 };
  if (/\bboston\b/.test(t)) return { lat: 42.3601, lon: -71.0589 };
  if (/\baustin\b/.test(t)) return { lat: 30.2672, lon: -97.7431 };
  if (/\bdenver\b/.test(t)) return { lat: 39.7392, lon: -104.9903 };
  if (/\bportland\b/.test(t) && !/\bmaine\b/.test(t))
    return { lat: 45.5152, lon: -122.6784 };
  return null;
}

async function geocodeNominatim(query: string): Promise<ToolExecution> {
  const expanded = expandPlaceQuery(query);
  return withNominatimSlot(async () => {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({
        q: expanded,
        format: "json",
        addressdetails: "0",
        extratags: "1",
        limit: "3",
      }).toString();
    const data = (await fetchJson(url, 2200)) as Array<{
      display_name?: string;
      lat?: string;
      lon?: string;
      type?: string;
      extratags?: Record<string, string>;
    }>;
    const bias = cityBiasForQuery(expanded);
    let results = (data || []).slice(0, 5).map((r) => {
      const hours = r.extratags?.opening_hours;
      const open = evalOpeningHours(hours);
      return {
        name: r.display_name,
        lat: Number(r.lat),
        lon: Number(r.lon),
        type: r.type,
        opening_hours: hours,
        phone: r.extratags?.phone || r.extratags?.["contact:phone"],
        website: r.extratags?.website,
        backend: "nominatim",
        ...open,
      };
    });
    if (bias) {
      results = [...results]
        .filter(
          (r) =>
            Number.isFinite(r.lat) &&
            haversineKm(r.lat, r.lon, bias.lat, bias.lon) < 120
        )
        .sort(
          (a, b) =>
            haversineKm(a.lat, a.lon, bias.lat, bias.lon) -
            haversineKm(b.lat, b.lon, bias.lat, bias.lon)
        )
        .slice(0, 3);
    } else {
      results = results.slice(0, 3);
    }
    return {
      output: { query: expanded, results },
      sources: results[0]?.name
        ? [{ title: results[0].name!, kind: "maps" }]
        : [],
    } satisfies ToolExecution;
  });
}

async function geocode(args: { query?: unknown }): Promise<ToolExecution> {
  const query = expandPlaceQuery(String(args.query ?? "").trim());
  if (!query) return { output: { error: "empty query" }, sources: [] };

  const cacheKey = query.toLowerCase();
  const cached = geocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < GEOCODE_CACHE_TTL_MS) {
    // LRU touch
    geocodeCache.delete(cacheKey);
    geocodeCache.set(cacheKey, cached);
    return cached.execution;
  }

  // Photon allows concurrent lookups (Nominatim is ~1 req/s) — critical for plan_trip.
  let execution = await geocodePhoton(query);
  const photonResults = (
    execution?.output as { results?: Array<{ lat: number; lon: number }> }
  )?.results;
  if (!execution || !photonResults?.length) {
    execution = await geocodeNominatim(query);
  }

  if (geocodeCache.size >= GEOCODE_CACHE_MAX) {
    const oldest = geocodeCache.keys().next().value;
    if (oldest) geocodeCache.delete(oldest);
  }
  geocodeCache.set(cacheKey, { at: Date.now(), execution });
  return execution;
}

async function routeOsrm(args: {
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  profile: "driving" | "foot" | "bike";
}): Promise<{
  ok: boolean;
  mode: string;
  distance_km?: number;
  duration_min?: number;
  via_roads?: string[];
  crow_flies_km: number;
  error?: string;
  note?: string;
}> {
  const crowKm =
    Math.round(
      haversineKm(args.fromLat, args.fromLon, args.toLat, args.toLon) * 10
    ) / 10;
  const modeLabel =
    args.profile === "foot"
      ? "walking"
      : args.profile === "bike"
        ? "cycling"
        : "driving";

  const url = `https://router.project-osrm.org/route/v1/${args.profile}/${args.fromLon},${args.fromLat};${args.toLon},${args.toLat}?overview=false&steps=true`;
  try {
    const data = (await fetchJson(url, 2800)) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        legs?: Array<{ steps?: Array<{ name?: string }> }>;
      }>;
      code?: string;
      message?: string;
    };
    const route0 = data.routes?.[0];
    if (!route0) {
      return {
        ok: false,
        mode: modeLabel,
        crow_flies_km: crowKm,
        error: data.message || data.code || "no route",
      };
    }
    const km = Math.round(((route0.distance ?? 0) / 1000) * 10) / 10;
    let minutes = Math.round((route0.duration ?? 0) / 60);
    const roads: string[] = [];
    for (const step of route0.legs?.[0]?.steps ?? []) {
      const name = (step.name || "").trim();
      if (!name || name === "-" || roads[roads.length - 1] === name) continue;
      roads.push(name);
      if (roads.length >= 6) break;
    }
    let note =
      args.profile === "driving"
        ? "Real road routing (not crow-flies)."
        : "Walk/bike routing may follow the road network.";
    const impliedKmh = km > 0 && minutes > 0 ? (km / minutes) * 60 : 0;
    if (args.profile === "foot" && impliedKmh > 8) {
      minutes = Math.max(1, Math.round((km / 4.5) * 60));
      note = "Walk time ~4.5 km/h on road distance.";
    } else if (args.profile === "bike" && impliedKmh > 35) {
      minutes = Math.max(1, Math.round((km / 16) * 60));
      note = "Bike time ~16 km/h on road distance.";
    }
    return {
      ok: true,
      mode: modeLabel,
      distance_km: km,
      duration_min: minutes,
      crow_flies_km: crowKm,
      via_roads: roads,
      note,
    };
  } catch (err) {
    return {
      ok: false,
      mode: modeLabel,
      crow_flies_km: crowKm,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function normalizeProfile(raw: unknown): "driving" | "foot" | "bike" {
  const p = String(raw ?? "driving").toLowerCase();
  if (p === "walking" || p === "foot") return "foot";
  if (p === "cycling" || p === "bike" || p === "bicycle") return "bike";
  return "driving";
}

async function route(args: {
  from_lat?: unknown;
  from_lon?: unknown;
  to_lat?: unknown;
  to_lon?: unknown;
  profile?: unknown;
}): Promise<ToolExecution> {
  const fromLat = Number(args.from_lat);
  const fromLon = Number(args.from_lon);
  const toLat = Number(args.to_lat);
  const toLon = Number(args.to_lon);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return { output: { error: "invalid coordinates" }, sources: [] };
  }
  const result = await routeOsrm({
    fromLat,
    fromLon,
    toLat,
    toLon,
    profile: normalizeProfile(args.profile),
  });
  if (!result.ok) {
    return {
      output: {
        error: result.error,
        crow_flies_km: result.crow_flies_km,
        approx_walk_min: Math.round((result.crow_flies_km / 5) * 60),
      },
      sources: [],
    };
  }
  return {
    output: {
      mode: result.mode,
      routed_on: "road_network",
      distance_km: result.distance_km,
      duration_min: result.duration_min,
      crow_flies_km: result.crow_flies_km,
      via_roads: result.via_roads,
      note: result.note,
    },
    sources: [
      {
        title: `${result.mode} ~${result.duration_min} min / ${result.distance_km} km`,
        kind: "maps",
      },
    ],
  };
}

async function routeCompare(args: {
  from_lat?: unknown;
  from_lon?: unknown;
  to_lat?: unknown;
  to_lon?: unknown;
  include_cycling?: unknown;
}): Promise<ToolExecution> {
  const fromLat = Number(args.from_lat);
  const fromLon = Number(args.from_lon);
  const toLat = Number(args.to_lat);
  const toLon = Number(args.to_lon);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return { output: { error: "invalid coordinates" }, sources: [] };
  }
  const profiles: Array<"driving" | "foot" | "bike"> = ["driving", "foot"];
  if (args.include_cycling === true || args.include_cycling === "true") {
    profiles.push("bike");
  }
  const modes = await Promise.all(
    profiles.map((profile) =>
      routeOsrm({ fromLat, fromLon, toLat, toLon, profile })
    )
  );
  return {
    output: {
      routed_on: "road_network",
      crow_flies_km: modes[0]?.crow_flies_km,
      modes: modes.map((m) =>
        m.ok
          ? {
              mode: m.mode,
              distance_km: m.distance_km,
              duration_min: m.duration_min,
              via_roads: m.via_roads?.slice(0, 4),
            }
          : { mode: m.mode, error: m.error }
      ),
      note: "Driving ≈ Uber/taxi road time (not wait/surge).",
    },
    sources: modes
      .filter((m) => m.ok)
      .map((m) => ({
        title: `${m.mode} ~${m.duration_min} min / ${m.distance_km} km`,
        kind: "maps",
      })),
  };
}

async function planTransit(args: {
  from_lat?: unknown;
  from_lon?: unknown;
  to_lat?: unknown;
  to_lon?: unknown;
}): Promise<ToolExecution> {
  const fromLat = Number(args.from_lat);
  const fromLon = Number(args.from_lon);
  const toLat = Number(args.to_lat);
  const toLon = Number(args.to_lon);
  if (![fromLat, fromLon, toLat, toLon].every(Number.isFinite)) {
    return { output: { error: "invalid coordinates" }, sources: [] };
  }
  const url =
    "https://api.transitous.org/api/v1/plan?" +
    new URLSearchParams({
      fromPlace: `${fromLat},${fromLon}`,
      toPlace: `${toLat},${toLon}`,
      arriveBy: "false",
      numItineraries: "3",
    }).toString();
  try {
    const data = (await fetchJson(url, 3200)) as {
      itineraries?: Array<{
        duration?: number;
        transfers?: number;
        startTime?: number;
        endTime?: number;
        legs?: Array<{
          mode?: string;
          duration?: number;
          from?: { name?: string };
          to?: { name?: string };
          routeShortName?: string;
        }>;
      }>;
    };
    const itineraries = (data.itineraries || []).slice(0, 3).map((it) => ({
      duration_min: Math.round((it.duration ?? 0) / 60),
      transfers: it.transfers ?? 0,
      legs: (it.legs || []).slice(0, 8).map((l) => ({
        mode: l.mode,
        duration_min: Math.round((l.duration ?? 0) / 60),
        from: l.from?.name,
        to: l.to?.name,
        route: l.routeShortName,
      })),
    }));
    if (itineraries.length === 0) {
      return {
        output: {
          error: "no transit itineraries",
          note: "Coverage varies by city; fall back to walk/drive.",
        },
        sources: [],
      };
    }
    const best = itineraries[0];
    return {
      output: {
        provider: "transitous",
        itineraries,
        note: "Public GTFS-based transit; schedules may lag.",
      },
      sources: [
        {
          title: `Transit ~${best.duration_min} min, ${best.transfers} transfers`,
          kind: "transit",
        },
      ],
    };
  } catch (err) {
    return {
      output: {
        error: err instanceof Error ? err.message : String(err),
        note: "Transit lookup failed; use walk/drive times.",
      },
      sources: [],
    };
  }
}

async function weather(args: {
  lat?: unknown;
  lon?: unknown;
}): Promise<ToolExecution> {
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { output: { error: "invalid lat/lon" }, sources: [] };
  }
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current:
        "temperature_2m,weather_code,wind_speed_10m,precipitation,is_day",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset",
      forecast_days: "3",
      timezone: "auto",
    }).toString();
  const data = (await fetchJson(url, 2000)) as {
    current?: Record<string, unknown>;
    daily?: {
      time?: string[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_sum?: number[];
      sunrise?: string[];
      sunset?: string[];
    };
    timezone?: string;
  };
  return {
    output: {
      timezone: data.timezone,
      current: data.current,
      daily: data.daily
        ? {
            time: data.daily.time?.slice(0, 3),
            temp_max: data.daily.temperature_2m_max?.slice(0, 3),
            temp_min: data.daily.temperature_2m_min?.slice(0, 3),
            precip: data.daily.precipitation_sum?.slice(0, 3),
            sunrise: data.daily.sunrise?.slice(0, 2),
            sunset: data.daily.sunset?.slice(0, 2),
          }
        : undefined,
    },
    sources: [
      {
        title: `Weather near ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
        kind: "weather",
      },
    ],
  };
}

function getCurrentTime(args: { timezone?: unknown }): ToolExecution {
  const timezone = String(args.timezone ?? "UTC").trim() || "UTC";
  try {
    const now = new Date();
    const formatted = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(now);
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        hour12: false,
      }).format(now)
    );
    return {
      output: {
        timezone,
        iso: now.toISOString(),
        local: formatted,
        hour_24: hour,
        is_evening: hour >= 17 || hour < 5,
      },
      sources: [{ title: `Time ${timezone}: ${formatted}`, kind: "time" }],
    };
  } catch {
    return { output: { error: "invalid timezone", timezone }, sources: [] };
  }
}

async function planTrip(args: {
  from?: unknown;
  to?: unknown;
  include_cycling?: unknown;
  include_weather?: unknown;
  include_transit?: unknown;
  timezone?: unknown;
}): Promise<ToolExecution> {
  const fromQ = String(args.from ?? "").trim();
  const toQ = String(args.to ?? "").trim();
  if (!fromQ || !toQ) {
    return { output: { error: "from and to required" }, sources: [] };
  }
  const includeWeather =
    args.include_weather !== false && args.include_weather !== "false";
  const includeTransit =
    args.include_transit !== false && args.include_transit !== "false";
  const tz =
    String(args.timezone ?? "").trim() ||
    inferTimezone(`${fromQ} ${toQ}`) ||
    "";

  const [fromGeo, toGeo] = await Promise.all([
    geocode({ query: fromQ }),
    geocode({ query: toQ }),
  ]);
  const time = tz ? getCurrentTime({ timezone: tz }) : null;

  const from = (
    fromGeo.output as {
      results?: Array<{ name?: string; lat: number; lon: number }>;
    }
  ).results?.[0];
  const to = (
    toGeo.output as {
      results?: Array<{ name?: string; lat: number; lon: number }>;
    }
  ).results?.[0];
  const sources: ToolSource[] = [...fromGeo.sources, ...toGeo.sources];
  if (!from || !to || !Number.isFinite(from.lat) || !Number.isFinite(to.lat)) {
    return {
      output: {
        error: "could not geocode endpoints",
        from: fromGeo.output,
        to: toGeo.output,
      },
      sources,
    };
  }

  const [compare, wx, transit] = await Promise.all([
    routeCompare({
      from_lat: from.lat,
      from_lon: from.lon,
      to_lat: to.lat,
      to_lon: to.lon,
      include_cycling: args.include_cycling,
    }),
    includeWeather
      ? weather({ lat: to.lat, lon: to.lon })
      : Promise.resolve(null),
    includeTransit
      ? planTransit({
          from_lat: from.lat,
          from_lon: from.lon,
          to_lat: to.lat,
          to_lon: to.lon,
        })
      : Promise.resolve(null),
  ]);

  sources.push(...compare.sources);
  if (wx) sources.push(...wx.sources);
  if (transit) sources.push(...transit.sources);
  if (time) sources.push(...time.sources);

  // Compact for the LLM — full payloads burn the tool-output budget.
  const road = compare.output as {
    modes?: Array<{
      mode?: string;
      duration_min?: number;
      distance_km?: number;
      error?: string;
    }>;
    error?: string;
  };
  const modes = (road.modes || []).map((m) =>
    m.error
      ? { mode: m.mode, error: m.error }
      : { mode: m.mode, min: m.duration_min, km: m.distance_km }
  );
  const transitOut = transit?.output as {
    itineraries?: Array<{
      duration_min?: number;
      transfers?: number;
      legs?: Array<{ mode?: string; route?: string }>;
    }>;
    error?: string;
  } | null;
  const it0 = transitOut?.itineraries?.[0];
  const bestTransit = it0
    ? {
        duration_min: it0.duration_min,
        transfers: it0.transfers,
        legs: (it0.legs || []).slice(0, 4).map((l) => ({
          mode: l.mode,
          route: l.route,
        })),
      }
    : transitOut?.error
      ? { error: transitOut.error }
      : undefined;
  const wxOut = wx?.output as {
    current?: Record<string, unknown>;
    daily?: { precipitation_sum?: number[]; temperature_2m_max?: number[] };
    error?: string;
  } | null;
  const weatherBrief = wxOut?.current
    ? {
        now: wxOut.current,
        precip_mm: wxOut.daily?.precipitation_sum?.[0],
        high_c: wxOut.daily?.temperature_2m_max?.[0],
      }
    : wxOut?.error
      ? { error: wxOut.error }
      : undefined;

  return {
    output: {
      from: { query: fromQ, name: from.name, lat: from.lat, lon: from.lon },
      to: { query: toQ, name: to.name, lat: to.lat, lon: to.lon },
      modes,
      transit: bestTransit,
      weather: weatherBrief,
      local_time: time?.output,
      note: "Compare walk / drive(Uber) / transit; driving ignores wait/surge.",
    },
    sources,
  };
}

const NEARBY_KIND: Record<
  string,
  { key: string; value: string }
> = {
  cafe: { key: "amenity", value: "cafe" },
  coffee: { key: "amenity", value: "cafe" },
  restaurant: { key: "amenity", value: "restaurant" },
  pharmacy: { key: "amenity", value: "pharmacy" },
  drugstore: { key: "amenity", value: "pharmacy" },
  supermarket: { key: "shop", value: "supermarket" },
  grocery: { key: "shop", value: "supermarket" },
  bank: { key: "amenity", value: "bank" },
  atm: { key: "amenity", value: "atm" },
  hospital: { key: "amenity", value: "hospital" },
  bar: { key: "amenity", value: "bar" },
  fuel: { key: "amenity", value: "fuel" },
  gas: { key: "amenity", value: "fuel" },
  library: { key: "amenity", value: "library" },
};

async function nearbyPlaces(args: {
  lat?: unknown;
  lon?: unknown;
  kind?: unknown;
  radius_m?: unknown;
  timezone?: unknown;
}): Promise<ToolExecution> {
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { output: { error: "invalid lat/lon" }, sources: [] };
  }
  const kindRaw = String(args.kind ?? "cafe").toLowerCase().trim();
  const tag = NEARBY_KIND[kindRaw] || NEARBY_KIND.cafe;
  const radius = Math.min(1500, Math.max(200, Number(args.radius_m) || 500));
  const tz = String(args.timezone ?? "").trim() || undefined;

  const query = `[out:json][timeout:4];
(
  node["${tag.key}"="${tag.value}"](around:${radius},${lat},${lon});
  way["${tag.key}"="${tag.value}"](around:${radius},${lat},${lon});
);
out center body 12;`;

  const mirrors = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  const body = new URLSearchParams({ data: query }).toString();
  const lastErrs: string[] = [];
  let data: { elements?: Array<Record<string, unknown>> } | null = null;
  for (const endpoint of mirrors) {
    try {
      data = (await fetchJson(`${endpoint}?${body}`, 2200, {
        method: "GET",
        headers: { Accept: "*/*" },
      })) as { elements?: Array<Record<string, unknown>> };
      break;
    } catch (err) {
      lastErrs.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!data) {
    // Overpass often 406/timeout on public mirrors — Photon POI search as fallback.
    try {
      const photonUrl =
        "https://photon.komoot.io/api/?" +
        new URLSearchParams({
          q: kindRaw === "pharmacy" ? "pharmacy" : kindRaw,
          lat: String(lat),
          lon: String(lon),
          limit: "12",
        }).toString();
      const photon = (await fetchJson(photonUrl, 2500, {
        headers: { Accept: "application/json" },
      })) as {
        features?: Array<{
          geometry?: { coordinates?: number[] };
          properties?: {
            name?: string;
            osm_key?: string;
            osm_value?: string;
            street?: string;
            housenumber?: string;
            postcode?: string;
            city?: string;
            type?: string;
          };
        }>;
      };
      const want =
        kindRaw === "pharmacy"
          ? ["pharmacy", "chemist"]
          : kindRaw === "cafe" || kindRaw === "coffee"
            ? ["cafe", "coffee"]
            : [kindRaw];
      const mapped = (photon.features || [])
        .map((f) => {
          const [plon, plat] = f.geometry?.coordinates || [];
          const p = f.properties || {};
          if (!Number.isFinite(plat) || !Number.isFinite(plon)) return null;
          const typeBlob = `${p.osm_value || ""} ${p.type || ""} ${p.name || ""}`.toLowerCase();
          if (
            want.length &&
            !want.some((w) => typeBlob.includes(w)) &&
            p.osm_value &&
            !want.includes(p.osm_value)
          ) {
            // keep if name looks right
            if (!want.some((w) => (p.name || "").toLowerCase().includes(w))) {
              return null;
            }
          }
          const dist = haversineM(lat, lon, plat, plon);
          if (dist > radius * 1.35) return null;
          const addr = [p.housenumber, p.street, p.city].filter(Boolean).join(" ");
          return {
            name: p.name || kindRaw,
            lat: plat,
            lon: plon,
            distance_m: Math.round(dist),
            address: addr || undefined,
          };
        })
        .filter(Boolean)
        .sort((a, b) => (a!.distance_m || 0) - (b!.distance_m || 0))
        .slice(0, 8);
      if (mapped.length > 0) {
        data = {
          elements: mapped.map((m) => ({
            type: "node",
            lat: m!.lat,
            lon: m!.lon,
            tags: {
              name: m!.name,
              "addr:full": m!.address,
            },
            _distance_m: m!.distance_m,
          })),
        };
      }
    } catch (err) {
      lastErrs.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (!data) {
    return {
      output: { error: lastErrs[0] || "overpass failed" },
      sources: [],
    };
  }

  const places = (data.elements || [])
    .map((el) => {
      const tags = (el.tags || {}) as Record<string, string>;
      const plat =
        Number(el.lat) ||
        Number((el.center as { lat?: number } | undefined)?.lat);
      const plon =
        Number(el.lon) ||
        Number((el.center as { lon?: number } | undefined)?.lon);
      if (!tags.name || !Number.isFinite(plat) || !Number.isFinite(plon)) {
        return null;
      }
      const dist_m = Math.round(haversineKm(lat, lon, plat, plon) * 1000);
      const open = evalOpeningHours(tags.opening_hours, tz);
      return {
        name: tags.name,
        lat: plat,
        lon: plon,
        dist_m,
        opening_hours: tags.opening_hours,
        phone: tags.phone || tags["contact:phone"],
        cuisine: tags.cuisine,
        ...open,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        ((a as { dist_m: number }).dist_m || 0) -
        ((b as { dist_m: number }).dist_m || 0)
    )
    .slice(0, 8);

  return {
    output: {
      kind: tag.value,
      radius_m: radius,
      count: places.length,
      places,
      note: "Map data; hours/open_now are best-effort.",
    },
    sources: (places as Array<{ name: string; dist_m: number; open_now?: boolean }>)
      .slice(0, 3)
      .map((p) => ({
        title: `${p.name} (~${p.dist_m}m)${
          p.open_now === true ? " open" : p.open_now === false ? " closed?" : ""
        }`,
        kind: "places",
      })),
  };
}

async function findNearby(args: {
  near?: unknown;
  kind?: unknown;
  radius_m?: unknown;
  timezone?: unknown;
  lat?: unknown;
  lon?: unknown;
}): Promise<ToolExecution> {
  const near = String(args.near ?? "").trim();
  const latArg = Number(args.lat);
  const lonArg = Number(args.lon);
  const hasCoords = Number.isFinite(latArg) && Number.isFinite(lonArg);
  if (!near && !hasCoords) {
    return { output: { error: "near or lat/lon required" }, sources: [] };
  }
  const tz =
    String(args.timezone ?? "").trim() ||
    inferTimezone(near) ||
    "UTC";

  let anchor: { name?: string; lat: number; lon: number };
  let geoSources: ToolSource[] = [];

  if (hasCoords && (!near || /\b(near me|here|around here|my location)\b/i.test(near))) {
    anchor = { name: near || "current location", lat: latArg, lon: lonArg };
  } else if (near) {
    const geo = await geocode({ query: near });
    const hit = (
      geo.output as {
        results?: Array<{ name?: string; lat: number; lon: number }>;
      }
    ).results?.[0];
    if (!hit || !Number.isFinite(hit.lat)) {
      // Client coords as soft fallback when named place fails
      if (hasCoords) {
        anchor = { name: near, lat: latArg, lon: lonArg };
        geoSources = geo.sources;
      } else {
        return {
          output: { error: "could not geocode near", geocode: geo.output },
          sources: geo.sources,
        };
      }
    } else {
      anchor = hit;
      geoSources = geo.sources;
    }
  } else {
    anchor = { name: "current location", lat: latArg, lon: lonArg };
  }

  const [places, time] = await Promise.all([
    nearbyPlaces({
      lat: anchor.lat,
      lon: anchor.lon,
      kind: args.kind ?? "cafe",
      radius_m: Number(args.radius_m) || 700,
      timezone: tz,
    }),
    Promise.resolve(getCurrentTime({ timezone: tz })),
  ]);

  const placesOut = places.output as {
    error?: string;
    count?: number;
    places?: Array<{ open_now?: boolean; name?: string }>;
  };
  const placeSources = places.sources;

  if (placesOut.error || !placesOut.count) {
    const kind = String(args.kind ?? "cafe");
    const placeQ = near || anchor.name || "me";
    const web = await webSearch(
      `${kind} near ${placeQ} open now hours`,
      {
        limit: 4,
        timeoutMs: 1800,
        allowWikiFallback: false,
        preferNumeric: false,
      }
    );
    const placeTokens = placeQ
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !/near|open|hours|the|and/.test(w));
    const scored = web.hits.map((h) => {
      const blob = `${h.title} ${h.snippet} ${h.url || ""}`.toLowerCase();
      const score = placeTokens.reduce(
        (n, tok) => n + (blob.includes(tok) ? 1 : 0),
        0
      );
      return { h, score };
    });
    scored.sort((a, b) => b.score - a.score);
    const hits = scored
      .filter((s) => s.score > 0 || placeTokens.length === 0)
      .map((s) => s.h)
      .filter((h) => !/wikipedia|duckduckgo\.com\/y\.js/i.test(`${h.title} ${h.url || ""}`));
    const useHits = hits.length > 0 ? hits : scored.map((s) => s.h).slice(0, 3);
    return {
      output: {
        near: {
          query: near || "current location",
          name: anchor.name,
          lat: anchor.lat,
          lon: anchor.lon,
        },
        local_time: time.output,
        places: placesOut,
        open_count: 0,
        suggestions: useHits.slice(0, 4).map((h) => ({
          title: h.title,
          snippet: h.snippet,
          url: h.url,
        })),
        note: "Map nearby lookup empty — web suggestions are unverified city-wide links, not ranked by distance. Prefer telling the user to confirm the nearest open pharmacy in a maps app rather than picking a far neighborhood store.",
      },
      sources: [
        ...geoSources,
        ...time.sources,
        ...useHits.slice(0, 3).map((h) => ({ title: h.title, kind: "web" })),
      ],
    };
  }

  const openOnes = (placesOut.places || []).filter((p) => p.open_now === true);

  return {
    output: {
      near: {
        query: near || "current location",
        name: anchor.name,
        lat: anchor.lat,
        lon: anchor.lon,
      },
      local_time: time.output,
      places: placesOut,
      open_count: openOnes.length,
      note:
        openOnes.length > 0
          ? "Prefer a place with open_now=true unless user wants a specific brand."
          : "No confirmed open_now; pick closest reasonable option and note uncertainty.",
    },
    sources: [...geoSources, ...placeSources, ...time.sources],
  };
}

async function wikipedia(args: { title?: unknown }): Promise<ToolExecution> {
  const title = String(args.title ?? "").trim();
  if (!title) return { output: { error: "empty title" }, sources: [] };
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;
  try {
    const data = (await fetchJson(url, 3000)) as {
      title?: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
      type?: string;
    };
    if (data.type === "disambiguation" || !data.extract) {
      const candidates = await wikiOpenSearch(title);
      return {
        output: {
          error: data.type === "disambiguation" ? "disambiguation" : "not_found",
          title: data.title || title,
          extract: data.extract?.slice(0, 400),
          candidates,
          note: "Pick a more specific title from candidates.",
        },
        sources: candidates.slice(0, 2).map((c) => ({
          title: `Wikipedia?: ${c}`,
          kind: "wiki",
        })),
      };
    }
    return {
      output: {
        title: data.title,
        description: data.description,
        extract: (data.extract || "").slice(0, 1200),
        url: data.content_urls?.desktop?.page,
      },
      sources: [{ title: `Wikipedia: ${data.title || title}`, kind: "wiki" }],
    };
  } catch {
    const candidates = await wikiOpenSearch(title);
    if (candidates.length) {
      return {
        output: { error: "not_found", candidates },
        sources: candidates.slice(0, 2).map((c) => ({
          title: `Wikipedia?: ${c}`,
          kind: "wiki",
        })),
      };
    }
    return { output: { error: "wikipedia failed" }, sources: [] };
  }
}

async function wikiOpenSearch(query: string): Promise<string[]> {
  try {
    const url =
      "https://en.wikipedia.org/w/api.php?" +
      new URLSearchParams({
        action: "opensearch",
        search: query,
        limit: "5",
        format: "json",
        origin: "*",
      }).toString();
    const data = (await fetchJson(url, 2500)) as unknown[];
    const titles = Array.isArray(data?.[1]) ? (data[1] as string[]) : [];
    return titles.slice(0, 5);
  } catch {
    return [];
  }
}

function reconstructAbstract(
  inverted?: Record<string, number[]>
): string | undefined {
  if (!inverted) return undefined;
  const pairs: Array<[number, string]> = [];
  for (const [word, idxs] of Object.entries(inverted)) {
    for (const i of idxs) pairs.push([i, word]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs
    .map((p) => p[1])
    .join(" ")
    .slice(0, 500);
}

async function scholarSearch(args: { query?: unknown }): Promise<ToolExecution> {
  const query = String(args.query ?? "").trim();
  if (!query) return { output: { error: "empty query" }, sources: [] };
  const url =
    "https://api.openalex.org/works?" +
    new URLSearchParams({
      search: query,
      per_page: "5",
      sort: "cited_by_count:desc",
      mailto: OPENALEX_MAILTO,
    }).toString();
  try {
    const data = (await fetchJson(url, 3000)) as {
      results?: Array<{
        display_name?: string;
        publication_year?: number;
        cited_by_count?: number;
        doi?: string;
        id?: string;
        abstract_inverted_index?: Record<string, number[]>;
      }>;
    };
    const papers = (data.results || [])
      .slice()
      .sort((a, b) => {
        const cy =
          (b.cited_by_count || 0) - (a.cited_by_count || 0);
        if (cy !== 0) return cy;
        return (b.publication_year || 0) - (a.publication_year || 0);
      })
      .slice(0, 3)
      .map((w) => ({
        title: w.display_name,
        year: w.publication_year,
        cited_by: w.cited_by_count,
        doi: w.doi,
        abstract: reconstructAbstract(w.abstract_inverted_index)?.slice(0, 280),
      }));
    return {
      output: {
        query,
        papers,
        note: "Not medical advice; prefer recent highly-cited reviews.",
      },
      sources: papers
        .filter((p) => p.title)
        .slice(0, 3)
        .map((p) => ({
          title: `${p.title} (${p.year ?? "?"}${p.doi ? `; ${p.doi}` : ""})`,
          kind: "scholar",
        })),
    };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      sources: [],
    };
  }
}

async function publicHolidays(args: {
  country?: unknown;
  year?: unknown;
  query?: unknown;
}): Promise<ToolExecution> {
  const country = String(args.country ?? "US").trim().toUpperCase();
  const year = Number(args.year) || new Date().getFullYear();
  const query = String(args.query ?? "").trim().toLowerCase();
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`;
  const data = (await fetchJson(url, 2500)) as Array<{
    date?: string;
    localName?: string;
    name?: string;
    types?: string[];
  }>;
  const today = new Date().toISOString().slice(0, 10);
  const all = (data || []).map((h) => ({
    date: h.date,
    name: h.localName || h.name,
    types: h.types,
  }));
  const matched = query
    ? all.filter((h) => {
        const n = (h.name || "").toLowerCase();
        return (
          n.includes(query) ||
          query.split(/\s+/).every((w) => w.length < 3 || n.includes(w))
        );
      })
    : [];
  const upcoming = all
    .filter((h) => h.date && h.date >= today)
    .slice(0, 8);
  const focus = matched.length > 0 ? matched.slice(0, 4) : upcoming;
  return {
    output: {
      country,
      year,
      ...(matched.length > 0
        ? { matched: focus, note: "Named holiday match for this year." }
        : { upcoming: focus }),
      bank_style_types: ["Public"],
    },
    sources: focus.slice(0, 3).map((h) => ({
      title: `${h.date} ${h.name}`,
      kind: "calendar",
    })),
  };
}

function unitConvert(args: {
  value?: unknown;
  from?: unknown;
  to?: unknown;
}): ToolExecution {
  const value = Number(args.value);
  const from = String(args.from ?? "").trim().toLowerCase();
  const to = String(args.to ?? "").trim().toLowerCase();
  if (!Number.isFinite(value) || !from || !to) {
    return { output: { error: "need value, from, to" }, sources: [] };
  }
  const alias: Record<string, string> = {
    c: "celsius",
    celsius: "celsius",
    f: "fahrenheit",
    fahrenheit: "fahrenheit",
    gas_mark: "gas_mark",
    "gas mark": "gas_mark",
    gasmark: "gas_mark",
    km: "km",
    kilometer: "km",
    kilometers: "km",
    mi: "mi",
    mile: "mi",
    miles: "mi",
    m: "m",
    meter: "m",
    meters: "m",
    ft: "ft",
    feet: "ft",
    foot: "ft",
    kg: "kg",
    kilogram: "kg",
    lb: "lb",
    lbs: "lb",
    pound: "lb",
    l: "l",
    liter: "l",
    gal: "gal",
    gallon: "gal",
  };
  const a = alias[from];
  const b = alias[to];
  if (!a || !b) {
    return { output: { error: "unsupported unit" }, sources: [] };
  }
  // UK gas mark → oven temp (common cookery table)
  if (a === "gas_mark") {
    // Common cookery table (US oven labels round to nearest 25°F)
    const gasToF: Record<number, number> = {
      1: 275,
      2: 300,
      3: 325,
      4: 350,
      5: 375,
      6: 400,
      7: 425,
      8: 450,
      9: 475,
    };
    const mark = Math.round(value);
    const f = gasToF[mark];
    if (!f) {
      return { output: { error: "unsupported gas mark" }, sources: [] };
    }
    const result =
      b === "fahrenheit"
        ? f
        : b === "celsius"
          ? Math.round(((f - 32) * 5) / 9)
          : null;
    if (result == null) {
      return { output: { error: "gas mark only converts to C/F" }, sources: [] };
    }
    return {
      output: {
        value,
        from: "gas_mark",
        to: b,
        result,
        note: "Standard UK gas mark → oven temperature.",
      },
      sources: [
        {
          title: `gas mark ${mark} ≈ ${result}°${b === "celsius" ? "C" : "F"}`,
          kind: "convert",
        },
      ],
    };
  }
  const toBase: Record<string, (n: number) => number> = {
    celsius: (n) => n,
    fahrenheit: (n) => ((n - 32) * 5) / 9,
    km: (n) => n * 1000,
    mi: (n) => n * 1609.344,
    m: (n) => n,
    ft: (n) => n * 0.3048,
    kg: (n) => n,
    lb: (n) => n * 0.45359237,
    l: (n) => n,
    gal: (n) => n * 3.785411784,
  };
  const fromBase: Record<string, (n: number) => number> = {
    celsius: (n) => n,
    fahrenheit: (n) => (n * 9) / 5 + 32,
    km: (n) => n / 1000,
    mi: (n) => n / 1609.344,
    m: (n) => n,
    ft: (n) => n / 0.3048,
    kg: (n) => n,
    lb: (n) => n / 0.45359237,
    l: (n) => n,
    gal: (n) => n / 3.785411784,
  };
  const temp =
    (a === "celsius" || a === "fahrenheit") &&
    (b === "celsius" || b === "fahrenheit");
  const len = new Set(["km", "mi", "m", "ft"]);
  const mass = new Set(["kg", "lb"]);
  const vol = new Set(["l", "gal"]);
  const ok =
    temp ||
    (len.has(a) && len.has(b)) ||
    (mass.has(a) && mass.has(b)) ||
    (vol.has(a) && vol.has(b));
  if (!ok) return { output: { error: "incompatible units" }, sources: [] };
  const result = Math.round(fromBase[b](toBase[a](value)) * 1000) / 1000;
  return {
    output: { value, from: a, to: b, result },
    sources: [{ title: `${value} ${a} = ${result} ${b}`, kind: "convert" }],
  };
}

async function forexRate(args: {
  from?: unknown;
  to?: unknown;
  amount?: unknown;
}): Promise<ToolExecution> {
  const from = String(args.from ?? "USD").trim().toUpperCase();
  const to = String(args.to ?? "EUR").trim().toUpperCase();
  const amountRaw = Number(args.amount);
  const amount = Number.isFinite(amountRaw) ? amountRaw : null;
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  try {
    const data = (await fetchJson(url, 2000)) as {
      amount?: number;
      base?: string;
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = data.rates?.[to];
    if (!Number.isFinite(rate)) {
      return { output: { error: `no rate ${from}→${to}` }, sources: [] };
    }
    const converted =
      amount != null
        ? Math.round(amount * (rate as number) * 100) / 100
        : undefined;
    return {
      output: {
        from,
        to,
        rate,
        date: data.date,
        ...(amount != null ? { amount, converted } : {}),
        note: "ECB reference rate.",
      },
      sources: [
        {
          title:
            amount != null && converted != null
              ? `${amount} ${from} → ${converted} ${to} @ ${rate}`
              : `${from}→${to} ${rate} (${data.date || "today"})`,
          kind: "market",
        },
      ],
    };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      sources: [],
    };
  }
}

function safeEvalArithmetic(expression: string): number {
  // Shunting-yard over + - * / ( ) and postfix % → /100
  const normalized = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");
  const tokens: string[] = [];
  const re = /\d+\.\d+|\d+|[+\-*/()]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) tokens.push(m[0]);
  if (tokens.join("") !== normalized.replace(/\s+/g, "")) {
    throw new Error("tokenize mismatch");
  }

  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const output: string[] = [];
  const ops: string[] = [];
  let prevOp = true;
  for (const t of tokens) {
    if (/^\d/.test(t)) {
      output.push(t);
      prevOp = false;
    } else if (t === "(") {
      ops.push(t);
      prevOp = true;
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        output.push(ops.pop()!);
      }
      if (ops.pop() !== "(") throw new Error("paren");
      prevOp = false;
    } else if (t === "+" || t === "-" || t === "*" || t === "/") {
      if (prevOp && (t === "+" || t === "-")) {
        output.push("0");
      }
      while (
        ops.length &&
        ops[ops.length - 1] !== "(" &&
        (prec[ops[ops.length - 1]] || 0) >= (prec[t] || 0)
      ) {
        output.push(ops.pop()!);
      }
      ops.push(t);
      prevOp = true;
    } else {
      throw new Error("bad token");
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(" || op === ")") throw new Error("paren");
    output.push(op);
  }

  const stack: number[] = [];
  for (const t of output) {
    if (/^\d/.test(t)) stack.push(Number(t));
    else {
      const b = stack.pop();
      const a = stack.pop();
      if (a == null || b == null) throw new Error("arity");
      if (t === "+") stack.push(a + b);
      else if (t === "-") stack.push(a - b);
      else if (t === "*") stack.push(a * b);
      else if (t === "/") {
        if (b === 0) throw new Error("div0");
        stack.push(a / b);
      } else throw new Error("op");
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    throw new Error("bad result");
  }
  return stack[0];
}

function calculate(args: { expression?: unknown }): ToolExecution {
  const expression = String(args.expression ?? "").trim();
  if (!expression) return { output: { error: "empty expression" }, sources: [] };
  if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
    return {
      output: { error: "only digits and + - * / ( ) % . allowed" },
      sources: [],
    };
  }
  if (expression.length > 120) {
    return { output: { error: "expression too long" }, sources: [] };
  }
  try {
    const result = safeEvalArithmetic(expression);
    const rounded = Math.round(result * 10000) / 10000;
    return {
      output: { expression, result: rounded },
      sources: [{ title: `${expression} = ${rounded}`, kind: "calc" }],
    };
  } catch (err) {
    return {
      output: { error: err instanceof Error ? err.message : String(err) },
      sources: [],
    };
  }
}

export async function executeAgentTool(
  name: string,
  rawArgs: unknown,
  opts?: { inferredTimezone?: string }
): Promise<ToolExecution> {
  let args =
    rawArgs && typeof rawArgs === "object"
      ? ({ ...(rawArgs as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  if (
    opts?.inferredTimezone &&
    (name === "get_current_time" ||
      name === "nearby_places" ||
      name === "find_nearby" ||
      name === "plan_trip")
  ) {
    args = withInferredTimezone(args, opts.inferredTimezone);
  }

  try {
    switch (name) {
      case "reach_search":
        return await reachSearch(args);
      case "web_search":
        // Legacy alias → Agent-Reach search channel
        return await reachSearch({
          query: (args as { query?: unknown }).query,
        });
      case "multi_search":
        return await reachSearch({
          queries: (args as { queries?: unknown }).queries,
        });
      case "reach_read":
      case "fetch_page":
        return await reachRead(args);
      case "reach_rss":
        return await reachRss(args);
      case "wikipedia":
        return await wikipedia(args);
      case "geocode":
        return await geocode(args);
      case "plan_trip":
        return await planTrip(args);
      case "find_nearby":
        return await findNearby(args);
      case "nearby_places":
        return await nearbyPlaces(args);
      case "weather":
        return await weather(args);
      case "get_current_time":
        return getCurrentTime(args);
      case "public_holidays":
        return await publicHolidays(args);
      case "scholar_search":
        return await scholarSearch(args);
      case "unit_convert":
        return unitConvert(args);
      case "calculate":
        return calculate(args);
      case "forex_rate":
        return await forexRate(args);
      case "plan_transit":
        return await planTransit(args);
      case "route":
      case "route_distance":
        return await route(args);
      case "route_compare":
        return await routeCompare(args);
      case "crypto_price":
      case "market_quote":
      case "air_quality":
      case "news_headlines":
        return {
          output: {
            error: "lookup unavailable",
          },
          sources: [],
        };
      default:
        return { output: { error: `Unknown tool: ${name}` }, sources: [] };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[tool:${name}] failed:`, message);
    return { output: { error: message }, sources: [] };
  }
}
