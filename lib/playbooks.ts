/**
 * Intent playbooks — run tools server-side without an LLM tool round.
 */

import {
  cityBiasForQuery,
  executeAgentTool,
  inferTimezone,
  type ToolSource,
} from "./agent-tools";
import { FACT_KIND_LABEL, sanitizeUserFacingText } from "./decide-prompts";

export type PlaybookIntent =
  | "skip"
  | "tip"
  | "money"
  | "forex"
  | "commute"
  | "nearby"
  | "health"
  | "news"
  | "entity"
  | "holiday"
  | "convert"
  | "url"
  | "weather"
  | "general";

export type PrefetchResult = {
  intent: PlaybookIntent;
  factsJson: string;
  sources: ToolSource[];
  toolCalls: number;
};

const CURRENCY =
  "USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|KRW|SGD|HKD|NZD|SEK|NOK|DKK|BRL|ZAR";

export function classifyIntent(situation?: string): PlaybookIntent {
  const t = (situation ?? "").toLowerCase();
  if (!t || t.length < 8) return "general";

  const interpersonal =
    /\b(text|message|apologiz|sorry|break.?up|split up|ex\b|friend|partner|boundary|feel|anxious|guilt|invite|rsvp|thank|in-?laws?|confront|cancel plans|drinks tonight|reply tonight|wedding|reply to (the\s+)?(email|text|message)|skip (the\s+)?meeting|cancel (the\s+)?meeting|call (him|her|them|my|the)|phone call|give .{0,20} a call)\b/i.test(
      t
    );
  // Judgment calls that priors handle well — avoid a useless web round-trip.
  const judgmentSkip =
    /\b(ask .{0,40}raise|no raise|raise this week|performance review)\b/.test(t) ||
    /\b(sleep now|finish .+ email|one more email)\b/.test(t) ||
    /\b(hand wash|dry clean|stain|wear something else)\b/.test(t) ||
    /\b(repair tech|fridge|loud hum|wait and see)\b/.test(t) ||
    /\b(return window|return or keep|fit is)\b/.test(t) ||
    /\b(split evenly|each pay for what|split the bill)\b/.test(t) ||
    /\b(barely use|streaming subscription|cancel now or keep)\b/.test(t) ||
    /\b(% off|today only).*\b(buy|wait)\b/.test(t) ||
    /\b(buy it now or wait|bigger sale)\b/.test(t) ||
    /\b(go to the gym or rest|scratchy|slept \d+ hours).*\b(gym|rest)\b/.test(t) ||
    /\b(gym or rest|rest today)\b/.test(t) ||
    /\b(road trip|rest weekend|decline)\b/.test(t) ||
    /\b(quit tomorrow|burned out|burnout).*\b(stay|quit|savings)\b/.test(t) ||
    /\b(chest tightness|book a doctor|monitor a few)\b/.test(t) ||
    /\b(cancel today|gym .{0,20}\$|subscription .{0,20}cancel)\b/.test(t) ||
    /\b(left me on read|matched with|ghost)\b/.test(t) ||
    /\b(quit .{0,20}by text|texting my boss|resign by text)\b/.test(t) ||
    /\b(out of clean|wash now or wear|work shirts)\b/.test(t) ||
    /\b(last-minute .{0,30}drive|3-hour drive|drive saturday)\b/.test(t) ||
    /\b(plant|yellowing|leaves yellow|overwater)\b/.test(t) ||
    /\b(tipping point|leave management|IC work|individual contributor)\b/.test(t) ||
    /\b(call in sick|fever|push through on zoom|sick day)\b/.test(t) ||
    /\b(hiring freeze|layoffs?).{0,40}raise\b|\braise.{0,40}(hiring freeze|layoff)\b/.test(
      t
    ) ||
    /\b(check engine|road trip this weekend)\b/.test(t) ||
    /\b(meme stock|fomo buy)\b/.test(t) ||
    /\b(buy now or keep renting|rent is \$\d|condo .{0,20}\$\d)/.test(t) ||
    /\b(streaming services|cancel two)\b/.test(t) ||
    /\b(ex'?s? birthday|happy birthday).{0,40}(ex|broke up)\b|\b(broke up).{0,40}birthday\b/.test(
      t
    ) ||
    /\b(tip 0%|tipping culture|make a point).{0,30}(tip|restaurant)\b|\b(tip 0%).{0,40}(restaurant|bill)\b/.test(
      t
    );

  const needsLiveFacts =
    /\b(tip|weather|rain|forecast|uber|lyft|holiday|news|headline|convert|celsius|fahrenheit|cafe|pharmacy|melatonin|ibuprofen|advil|tylenol|aspirin|supplement|flu shot|vaccine|exchange rate|forex|usd to|eur to|jpy|yen)\b/i.test(
      t
    ) ||
    (/\d+\s*%/.test(t) && /\b(tip|gratuity)\b/i.test(t)) ||
    (/\$\d/.test(t) &&
      /\b(tip|bill|restaurant|exchange|invest|spare|speculative|salary|k\b|eng)\b/.test(
        t
      )) ||
    /\bhttps?:\/\//.test(t) ||
    /\b(study|research|evidence|clinical|guideline)\b/.test(t) ||
    (/\b(from .+ to|ferry building|twin peaks)\b/.test(t) &&
      /\b(walk|drive|uber|transit|bus)\b/.test(t));

  if (
    (interpersonal || judgmentSkip) &&
    !needsLiveFacts &&
    !/\b(tip|restaurant bill|uber fare)\b/.test(t)
  ) {
    return "skip";
  }
  if (/\b(rsvp|wedding invite)\b/.test(t) && !/\bhttps?:\/\//.test(t)) {
    return "skip";
  }

  if (
    /\bhttps?:\/\//.test(t) ||
    /\b(youtube\.com|youtu\.be|github\.com\/[\w.-]+\/[\w.-]+)\b/i.test(t)
  ) {
    return "url";
  }
  if (
    /\b(forex|exchange rate|currency convert|exchanging \d+|usd to|eur to|gbp to|jpy to|yen)\b/.test(
      t
    ) ||
    new RegExp(
      `\\b(\\d+(?:\\.\\d+)?)\\s*(?:${CURRENCY})\\b.{0,24}\\b(?:in|to|into|→|->)\\s*(?:${CURRENCY})\\b`,
      "i"
    ).test(t) ||
    new RegExp(
      `\\b(?:${CURRENCY})\\s*(?:to|in|into|→|->|/)\\s*(?:${CURRENCY})\\b`,
      "i"
    ).test(t)
  ) {
    return "forex";
  }
  if (
    /\b(tip|tips|tipping|gratuity)\b/.test(t) &&
    !/\b(tipping point|tip of the|tip my friend|tip someone off)\b/.test(t)
  ) {
    return "tip";
  }
  if (
    /\b(weather|rain|storm|forecast|umbrella|picnic|outdoor).*\b(today|afternoon|tonight|tomorrow|this (morning|evening|weekend))\b/.test(
      t
    ) ||
    /\b(what'?s|how'?s|check)\s+(the\s+)?weather\b/.test(t) ||
    /\bweather\s+(in|for|near)\b/.test(t) ||
    /\b(should we (move indoors|cancel)|rain (likely|coming))\b/.test(t)
  ) {
    return "weather";
  }
  const travelVerb =
    /\b(walk|drive|uber|lyft|taxi|commute|directions|bike|transit|bus|train|bart|subway|metro)\b/.test(
      t
    );
  // Don't treat "road trip / drive Saturday" judgment as a maps commute.
  if (
    /\b(road trip|rest weekend|last-minute .{0,20}drive|drive saturday|friends .{0,30}drive)\b/.test(
      t
    ) &&
    !/\b(from .+ to|ferry|twin peaks|airport|station|uber|transit|bart)\b/.test(t)
  ) {
    // fall through — usually skip via judgmentSkip / general
  } else {
  const placeTrip =
    /\bfrom\s+[A-Z][\w\s.'-]{2,40}\s+to\s+[A-Z][\w\s.'-]{2,40}/i.test(
      situation ?? ""
    ) || /\b(ferry building|twin peaks|airport|station)\b/i.test(t);
  if (
    travelVerb &&
    (placeTrip ||
      /\bfrom\s+.+\s+to\s+/.test(t) ||
      /\bto\s+(the\s+)?(airport|station|office|downtown)\b/.test(t)) &&
    !/\b(switch from|upgrade from|migrate from|change from|go from \w+ to fiber|comcast|isp|provider|plan to|from home to work remotely)\b/.test(
      t
    ) &&
    !/\b(skip|cancel|miss|reply to|send|write|answer)\s+(an?\s+)?(email|meeting|text)\b/.test(
      t
    ) &&
    !/\b(go to (the\s+)?gym|hit the gym|workout|sleep in|take a nap)\b/.test(t) &&
    !/\b(email|text|message)\s+(my|the|him|her|them|boss|coworker)/.test(t)
  ) {
    return "commute";
  }
  // Travel without "from…to" but with classic mode choice
  if (
    travelVerb &&
    /\b(or|vs\.?|versus)\b/.test(t) &&
    /\b(walk|uber|lyft|transit|drive|bike)\b/.test(t) &&
    !/\b(comcast|fiber|isp|subscription|email|meeting|road trip|rest weekend)\b/.test(t)
  ) {
    return "commute";
  }
  }
  if (
    /\b(nearby|near me|open now|closest|around here)\b/.test(t) ||
    (/\b(cafe|coffee|pharmacy|drugstore|supermarket|grocery|atm|bar)\b/.test(
      t
    ) &&
      /\b(near|at the|i'?m at|i am at|which|where)\b/.test(t))
  ) {
    return "nearby";
  }
  if (
    /\b(study|studies|research|evidence|meta-?analysis|peer-?reviewed|clinical|side.?effect|supplement|vaccine|flu shot|melatonin|ibuprofen|advil|tylenol|aspirin|acetaminophen|chest tightness|diagnosis|guideline|headache after)\b/.test(
      t
    ) &&
    !/\b(healthy boundary|healthier habit|mental health day)\b/.test(t)
  ) {
    return "health";
  }
  if (
    /\b(news|headline|breaking|today'?s news|current events|market-moving|election|poll)\b/.test(
      t
    )
  ) {
    return "news";
  }
  if (
    /\b(invest|spare cash|speculative|stock|etf|brokerage|401k|salary|senior eng|total comp|\$\d+k)\b/.test(
      t
    ) ||
    (/\$\d/.test(t) &&
      /\b(invest|trade|stock|etf|spare|portfolio|salary|eng|comp)\b/.test(t))
  ) {
    return "money";
  }
  if (/\b(what is|who is|explain|meaning of|history of|define)\b/.test(t)) {
    return "entity";
  }
  if (
    /\b(holiday|bank holiday|memorial day|labor day|christmas|thanksgiving|new year'?s?|juneteenth|independence day|mlk|presidents'? day|boxing day)\b/.test(
      t
    )
  ) {
    return "holiday";
  }
  if (
    /\b(convert|celsius|fahrenheit|gas mark|\bkg\b|\blbs?\b|miles? to|km to|in fahrenheit|in celsius)\b/.test(
      t
    )
  ) {
    return "convert";
  }
  return "general";
}

function looksLikeFeedUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    /\/(feed|rss|atom)(\/|\.|\?|$)/i.test(u) || /\.(rss|atom|xml)(\?|$)/i.test(u)
  );
}

function extractTipBill(situation: string): number | null {
  const m = /\$\s*(\d+(?:\.\d+)?)/.exec(situation);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function extractTripEndpoints(situation: string): {
  from: string;
  to: string;
} | null {
  const m =
    /(?:from|between)\s+(.+?)\s+(?:to|and|->|→)\s+(.+?)(?:\s+this|\s+tonight|\s+today|\s+this\s+evening|\s+in\s|\?|$)/i.exec(
      situation
    );
  let from: string | null = null;
  let to: string | null = null;
  if (m) {
    from = m[1].trim().slice(0, 120);
    to = m[2].trim().slice(0, 120);
  } else {
    // "Walk or Uber Ferry Building to Twin Peaks"
    const m2 =
      /(?:walk|uber|lyft|transit|drive).{0,40}?([A-Z][\w\s.'-]{2,40}?)\s+to\s+([A-Z][\w\s.'-]{2,40}?)(?:\s|$|\?)/.exec(
        situation
      );
    if (m2) {
      from = m2[1].trim();
      to = m2[2].trim();
    }
  }
  if (!from || !to) return null;

  // Attach city context from the utterance so Photon/Nominatim disambiguate.
  const city =
    /\b(san francisco|\bsf\b)\b/i.test(situation)
      ? "San Francisco"
      : /\b(new york|\bnyc\b)\b/i.test(situation)
        ? "New York"
        : /\b(los angeles|\bla\b)\b/i.test(situation)
          ? "Los Angeles"
          : /\b(seattle|chicago|boston|austin|denver|portland)\b/i.exec(
                situation
              )?.[1] || null;
  const withCity = (place: string) => {
    if (!city) return place;
    let p = place.replace(/\bSF\b/gi, "San Francisco").replace(/\bNYC\b/gi, "New York");
    if (new RegExp(city.replace(/\s+/g, "\\s+"), "i").test(p)) return p;
    return `${p} ${city}`;
  };
  return { from: withCity(from), to: withCity(to) };
}

function extractNearby(situation: string): { near: string; kind: string } {
  const kindMatch =
    /\b(cafe|coffee|pharmacy|restaurant|bar|atm|grocery|supermarket)\b/i.exec(
      situation
    );
  const kind = (kindMatch?.[1] || "cafe").toLowerCase().replace("coffee", "cafe");

  // Prefer an explicit place ("At Ferry Building…") over "nearby" wording.
  const atPlace =
    /(?:at|near|around)\s+(?!me\b|here\b)(.+?)(?:\s+—|\s+-|\s+for|\s+which|\s+open|\s+right|\?|$)/i.exec(
      situation
    );
  if (atPlace?.[1]) {
    const near = atPlace[1]
      .replace(/\b(sf|san francisco)\b/i, "")
      .trim()
      .replace(/[.,;:]+$/, "")
      .slice(0, 120);
    const city =
      /\bsan francisco|\bsf\b/i.test(situation)
        ? "San Francisco"
        : /\bnew york|\bnyc\b/i.test(situation)
          ? "New York"
          : "";
    const labeled =
      near && city && !new RegExp(city, "i").test(near)
        ? `${near} ${city}`
        : near || city || "current location";
    return { near: labeled || "current location", kind };
  }

  if (/\bnear me\b|\baround here\b/i.test(situation)) {
    return { near: "current location", kind };
  }

  return { near: situation.slice(0, 80), kind };
}

function extractHolidayCountry(situation: string): string {
  if (/\b(uk|u\.k\.|united kingdom|britain|england|scotland|wales)\b/i.test(situation))
    return "GB";
  if (/\b(canada|canadian)\b/i.test(situation)) return "CA";
  if (/\b(australia|australian)\b/i.test(situation)) return "AU";
  if (/\b(germany|german)\b/i.test(situation)) return "DE";
  if (/\b(france|french)\b/i.test(situation)) return "FR";
  if (/\b(japan|japanese)\b/i.test(situation)) return "JP";
  return "US";
}

function extractForexPair(situation: string): {
  from: string;
  to: string;
  amount: number | null;
} {
  const cur = CURRENCY;
  const pair =
    new RegExp(
      `\\b(\\d+(?:\\.\\d+)?)\\s*(${cur})\\b.{0,24}\\b(?:in|to|into|→|->)\\s*(${cur})\\b`,
      "i"
    ).exec(situation) ||
    new RegExp(
      `\\b(${cur})\\s*(?:to|in|into|→|->|/)\\s*(${cur})\\b`,
      "i"
    ).exec(situation) ||
    /(\bUSD|EUR|GBP|JPY|CAD|AUD|CHF\b)\s+to\s+(\bUSD|EUR|GBP|JPY|CAD|AUD|CHF\b)/i.exec(
      situation
    );

  let from = "USD";
  let to = "EUR";
  let amount: number | null = null;
  if (pair) {
    if (pair.length >= 4 && /^\d/.test(pair[1])) {
      amount = Number(pair[1]);
      from = pair[2].toUpperCase();
      to = pair[3].toUpperCase();
    } else {
      from = pair[1].toUpperCase();
      to = pair[2].toUpperCase();
    }
  } else {
    if (/\bEUR\b/i.test(situation)) to = "EUR";
    else if (/\bGBP\b/i.test(situation)) to = "GBP";
    else if (/\bJPY\b|\byen\b/i.test(situation)) to = "JPY";
  }
  if (amount == null) {
    const amountMatch =
      /(\d+(?:\.\d+)?)\s*(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|dollars?|euros?|pounds?|yen)?/i.exec(
        situation
      );
    if (amountMatch) amount = Number(amountMatch[1]);
  }
  return {
    from,
    to,
    amount: amount != null && Number.isFinite(amount) ? amount : null,
  };
}

function extractConvert(situation: string): {
  value: number;
  from: string;
  to: string;
} | null {
  const gas =
    /gas\s*mark\s*(\d+(?:\.\d+)?)/i.exec(situation) ||
    /mark\s*(\d+(?:\.\d+)?)\b/i.exec(situation);
  if (gas && /\b(fahrenheit|°?f|us oven|oven)\b/i.test(situation)) {
    return { value: Number(gas[1]), from: "gas_mark", to: "f" };
  }
  if (gas && /\b(celsius|°?c)\b/i.test(situation)) {
    return { value: Number(gas[1]), from: "gas_mark", to: "c" };
  }
  const direct =
    /(\d+(?:\.\d+)?)\s*(celsius|fahrenheit|°?c|°?f|kg|lbs?|pounds?|miles?|km|meters?|m|liters?|l|gallons?|gal)\s*(?:to|in|→|->)\s*(celsius|fahrenheit|°?c|°?f|kg|lbs?|pounds?|miles?|km|meters?|m|liters?|l|gallons?|gal)/i.exec(
      situation
    );
  const loose =
    /(\d+(?:\.\d+)?)\s*(celsius|fahrenheit|°?c|°?f|kg|lbs?|pounds?|miles?|km)\b[\s\S]{0,40}?\b(?:in|to)\s+(celsius|fahrenheit|°?c|°?f|kg|lbs?|pounds?|miles?|km)/i.exec(
      situation
    );
  const m = direct || loose;
  if (!m) return null;
  const norm = (u: string) => {
    const x = u.toLowerCase().replace("°", "");
    if (x === "c" || x === "celsius") return "c";
    if (x === "f" || x === "fahrenheit") return "f";
    if (x.startsWith("lb") || x.startsWith("pound")) return "lb";
    if (x === "kg") return "kg";
    if (x.startsWith("mile")) return "mi";
    if (x === "km") return "km";
    if (x === "m" || x.startsWith("meter")) return "m";
    if (x.startsWith("gal")) return "gal";
    if (x === "l" || x.startsWith("liter")) return "l";
    return x;
  };
  return { value: Number(m[1]), from: norm(m[2]), to: norm(m[3]) };
}

function extractTipPercents(situation: string): number[] {
  const found = [...situation.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) =>
    Number(m[1])
  );
  const pcts = found.filter((n) => n >= 5 && n <= 40);
  if (pcts.length > 0) return [...new Set(pcts)].slice(0, 3);
  return [15, 18, 20];
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  sources: ToolSource[],
  inferredTimezone?: string
): Promise<{ name: string; output: unknown }> {
  const executed = await executeAgentTool(name, args, { inferredTimezone });
  sources.push(...executed.sources);
  return { name, output: executed.output };
}

export async function prefetchPlaybook(args: {
  situation: string;
  lat?: number;
  lon?: number;
  onTool?: (name: string, sources: ToolSource[]) => void;
}): Promise<PrefetchResult> {
  const t0 = Date.now();
  const situation = args.situation.trim();
  const intent = classifyIntent(situation);
  const sources: ToolSource[] = [];
  const results: Array<{ name: string; output: unknown }> = [];
  const tz = inferTimezone(situation);
  let toolCalls = 0;

  const track = async (
    name: string,
    toolArgs: Record<string, unknown>
  ) => {
    const r = await runTool(name, toolArgs, sources, tz);
    toolCalls += 1;
    results.push(r);
    args.onTool?.(name, [...sources]);
    return r;
  };

  if (intent === "skip") {
    return { intent, factsJson: "", sources: [], toolCalls: 0 };
  }

  if (intent === "tip") {
    const bill = extractTipBill(situation);
    const delivery = /\b(doordash|uber\s*eats|grubhub|delivery|app)\b/i.test(
      situation
    );
    const tipQuery = delivery
      ? "US food delivery app tip percentage average 2024 2025"
      : situation.includes("US") || /\bus\b/i.test(situation)
        ? "US restaurant tip percentage average 2024 2025 sit-down"
        : `${situation.slice(0, 80)} tip percentage average`;
    const jobs: Promise<unknown>[] = [
      track("reach_search", {
        query: tipQuery,
        preferNumeric: true,
        limit: 4,
        timeoutMs: 2000,
      }),
    ];
    if (bill != null) {
      for (const pct of extractTipPercents(situation)) {
        jobs.push(
          track("calculate", { expression: `${bill} * ${pct / 100}` })
        );
      }
    }
    await Promise.all(jobs);
  } else if (intent === "money") {
    const q = /\b(invest|spare|speculative|trade|stock|etf)\b/i.test(situation)
      ? "keeping cash vs speculative trading short-term risk"
      : /\b(salary|\$\d+k|total comp|senior eng)\b/i.test(situation)
        ? `${situation.slice(0, 90)} salary range`
        : situation.slice(0, 100);
    await track("reach_search", {
      query: q,
      preferNumeric: true,
      limit: 3,
      timeoutMs: 2000,
    });
  } else if (intent === "url") {
    const urlMatch = /https?:\/\/[^\s)\]"'<>]+/i.exec(situation);
    const url = urlMatch?.[0]?.replace(/[.,;:!?]+$/, "");
    if (url) {
      const jobs: Promise<unknown>[] = [track("reach_read", { url })];
      if (/\b(rss|feed|atom)\b/i.test(url) || looksLikeFeedUrl(url)) {
        jobs.push(track("reach_rss", { url }));
      }
      await Promise.all(jobs);
    } else {
      await track("reach_search", {
        query: situation.slice(0, 100),
        limit: 3,
        timeoutMs: 2000,
      });
    }
  } else if (intent === "forex") {
    const { from, to, amount } = extractForexPair(situation);
    await track("forex_rate", {
      from,
      to,
      ...(amount != null ? { amount } : {}),
    });
  } else if (intent === "commute") {
    const ends = extractTripEndpoints(situation);
    if (!ends) {
      await track("reach_search", {
        query: `${situation.slice(0, 90)} transit walk drive time`,
        limit: 3,
        timeoutMs: 2000,
      });
    } else {
      const { from, to } = ends;
      const jobs: Promise<unknown>[] = [
        track("plan_trip", {
          from,
          to,
          timezone: tz || inferTimezone(`${from} ${to}`) || undefined,
        }),
      ];
      if (/\b(cost|price|fare|surge|cheap|expensive|delay)\b/i.test(situation)) {
        jobs.push(
          track("reach_search", {
            query: `Uber fare ${from} to ${to} typical cost`,
            preferNumeric: true,
            limit: 3,
            timeoutMs: 1800,
          })
        );
      }
      await Promise.all(jobs);
    }
  } else if (intent === "nearby") {
    const { near, kind } = extractNearby(situation);
    const radius =
      kind === "pharmacy" || kind === "hospital" ? 1200 : 700;
    const nearArgs: Record<string, unknown> = {
      near,
      kind,
      radius_m: radius,
    };
    if (Number.isFinite(args.lat) && Number.isFinite(args.lon)) {
      nearArgs.lat = args.lat;
      nearArgs.lon = args.lon;
      if (near === "current location") {
        delete nearArgs.near;
      }
    } else if (near === "current location") {
      await track("reach_search", {
        query: `${kind} open now near me`,
        limit: 3,
        timeoutMs: 1800,
      });
    }
    if (!(near === "current location" && !Number.isFinite(args.lat))) {
      const nearby = await track("find_nearby", nearArgs);
      const out = nearby.output as {
        places?: { places?: unknown[]; count?: number } | unknown[];
        open_count?: number;
        error?: string;
      };
      const list = Array.isArray(out?.places)
        ? out.places
        : Array.isArray((out?.places as { places?: unknown[] })?.places)
          ? (out.places as { places: unknown[] }).places
          : [];
      if (list.length === 0) {
        const placeHint =
          near !== "current location" ? near : situation.slice(0, 40);
        await track("reach_search", {
          query: /\bsf\b|san francisco|ferry/i.test(situation)
            ? `${kind} near Ferry Building San Francisco CA open now hours`
            : `${kind} near ${placeHint} open now hours address`,
          limit: 4,
          timeoutMs: 2000,
        });
      }
    }
  } else if (intent === "weather") {
    const place =
      /(?:in|near|for)\s+([A-Za-z][\w\s.'-]{2,40}?)(?:\s+this|\s+today|\s+tomorrow|\s+afternoon|\s+—|\?|$)/i.exec(
        situation
      )?.[1] ||
      (/\bsan francisco|\bsf\b/i.test(situation)
        ? "San Francisco"
        : /\bnew york|\bnyc\b/i.test(situation)
          ? "New York"
          : /\bseattle\b/i.test(situation)
            ? "Seattle"
            : null);
    const bias = cityBiasForQuery(place || situation);
    if (bias) {
      await track("weather", { lat: bias.lat, lon: bias.lon });
    } else if (
      !place &&
      Number.isFinite(args.lat) &&
      Number.isFinite(args.lon)
    ) {
      await track("weather", { lat: args.lat, lon: args.lon });
    } else {
      const geo = await track("geocode", {
        query: String(place || situation.slice(0, 60)).trim(),
      });
      const hit = (
        geo.output as { results?: Array<{ lat?: number; lon?: number }> }
      )?.results?.[0];
      if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) {
        await track("weather", { lat: hit.lat, lon: hit.lon });
      } else {
        await track("reach_search", {
          query: `${situation.slice(0, 80)} weather forecast`,
          limit: 3,
          timeoutMs: 1800,
        });
      }
    }
  } else if (intent === "health") {
    const topic =
      /\b(melatonin|ibuprofen|supplement|vaccine|aspirin|acetaminophen|tylenol|advil)\b/i.exec(
        situation
      )?.[1] || situation.slice(0, 80);
    await Promise.all([
      track("scholar_search", {
        query: `${topic} systematic review OR guideline`,
      }),
      track("reach_search", {
        query: `${topic} clinical guideline evidence`,
        limit: 3,
        timeoutMs: 2000,
      }),
    ]);
  } else if (intent === "news") {
    const search = await track("reach_search", {
      query: /\bmarket|finance|interview\b/i.test(situation)
        ? "US stock market moving headlines today"
        : `${situation.slice(0, 90)} latest news`,
      limit: 4,
      timeoutMs: 2000,
    });
    const hits =
      (
        search.output as {
          hits?: Array<{ url?: string; snippet?: string }>;
          results?: Array<{ hits?: Array<{ url?: string; snippet?: string }> }>;
        }
      )?.hits ||
      (search.output as {
        results?: Array<{ hits?: Array<{ url?: string; snippet?: string }> }>;
      })?.results?.[0]?.hits ||
      [];
    const richEnough = hits.some(
      (h) => (h.snippet || "").length >= 120
    );
    const topUrl = hits.find((h) => h.url && /^https?:\/\//i.test(h.url))?.url;
    // Skip slow page-read when snippets already carry the story.
    if (topUrl && !richEnough) {
      const readP = runTool("reach_read", { url: topUrl }, sources, tz);
      const winner = await Promise.race([
        readP.then((r) => ({ ok: true as const, r })),
        new Promise<{ ok: false }>((resolve) =>
          setTimeout(() => resolve({ ok: false }), 1600)
        ),
      ]);
      if (winner.ok) {
        toolCalls += 1;
        results.push(winner.r);
        args.onTool?.("reach_read", [...sources]);
      }
    }
  } else if (intent === "entity") {
    const title =
      /(?:what is|who is|explain|define)\s+(.+?)(?:\?|$)/i.exec(situation)?.[1] ||
      situation.slice(0, 60);
    const wiki = await track("wikipedia", { title: title.trim() });
    const wikiOk =
      wiki.output &&
      typeof wiki.output === "object" &&
      !("error" in (wiki.output as object));
    if (!wikiOk) {
      await track("reach_search", {
        query: title.trim(),
        limit: 3,
        timeoutMs: 1800,
      });
    }
  } else if (intent === "holiday") {
    const named =
      /\b(memorial day|labor day|christmas|thanksgiving|new year'?s?( day)?|juneteenth|independence day|martin luther king|presidents'? day|veterans day|columbus day|boxing day)\b/i.exec(
        situation
      )?.[1];
    await track("public_holidays", {
      country: extractHolidayCountry(situation),
      ...(named ? { query: named } : {}),
    });
  } else if (intent === "convert") {
    const conv = extractConvert(situation);
    if (conv) {
      await track("unit_convert", {
        value: conv.value,
        from: conv.from,
        to: conv.to,
      });
    } else {
      await track("reach_search", {
        query: situation.slice(0, 80),
        limit: 3,
        timeoutMs: 1600,
      });
    }
  } else {
    // general — one tight search, or none when the utterance is pure judgment
    if (
      /\b(should i|do i|would you)\b/i.test(situation) &&
      !/\b(price|cost|rate|percent|hours|open|closed|when|where)\b/i.test(
        situation
      )
    ) {
      // No tools — synthesis uses priors only.
    } else {
      await track("reach_search", {
        query: situation.slice(0, 100),
        limit: 3,
        timeoutMs: 1800,
      });
    }
  }

  const factsJson = JSON.stringify(
    results.map((r) => ({
      kind: FACT_KIND_LABEL[r.name] || "fact",
      result: scrubFactOutput(r.output),
    }))
  ).slice(0, 8000);

  console.info(
    `[playbook] intent=${intent} tools=${toolCalls} sources=${sources.length} ${Date.now() - t0}ms`
  );

  return { intent, factsJson, sources, toolCalls };
}

/** Keep tool-id / provider jargon out of the facts blob the model sees. */
function scrubFactOutput(output: unknown, depth = 0): unknown {
  if (depth > 6 || output == null) return output;
  if (typeof output === "string") {
    // Don't mangle URLs/hostnames (e.g. overpass-api.de).
    if (/https?:\/\//i.test(output) || /\.[a-z]{2,}\//i.test(output)) {
      return output;
    }
    return sanitizeUserFacingText(output) || output;
  }
  if (Array.isArray(output)) {
    return output.map((item) => scrubFactOutput(item, depth + 1));
  }
  if (typeof output === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
      const key = k === "web_hints" ? "suggestions" : k;
      o[key] = scrubFactOutput(v, depth + 1);
    }
    if (typeof o.error === "string" && !o.error.trim()) {
      o.error = "lookup failed";
    }
    return o;
  }
  return output;
}
