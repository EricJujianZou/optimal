#!/usr/bin/env node
/**
 * Thorough stress / quality battery for /api/decide.
 * Invented + common real-world daily dilemmas (non-travel heavy).
 * Usage: node scripts/stress-decide.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3001";

/** @type {Array<{id:string,text:string,expect?:RegExp,forbid?:RegExp,maxMs?:number,needSrc?:boolean,note?:string}>} */
const CASES = [
  // —— Money / etiquette ——
  { id: "tip-us80", text: "How much should I tip on an $80 sit-down dinner in the US?", expect: /\$|15|16|18|20|tip/i, needSrc: true, maxMs: 12000 },
  { id: "tip-doordash", text: "Tip 15% or 20% on a $32 DoorDash order?", expect: /\$|4\.|5\.|6\.|15|20|tip/i, maxMs: 12000 },
  { id: "tip-barista", text: "Should I tip $1 or $2 on a $5 coffee at a cafe counter?", expect: /\$|tip|1|2|coffee/i, maxMs: 12000 },
  { id: "split-bill", text: "Dinner was $96 for four friends — split evenly or each pay for what they ordered?", expect: /split|even|order|pay|each|fair/i, maxMs: 8000 },
  { id: "spare-cash", text: "I have $300 spare — put it into a meme stock or keep cash?", expect: /cash|keep|wait|risk|not|don't|avoid/i, needSrc: true, maxMs: 12000 },
  { id: "cancel-gym", text: "I went to the gym twice in 3 months but pay $60/mo — cancel today or wait until next billing?", expect: /cancel|keep|billing|gym|waste/i, maxMs: 8000 },
  { id: "return-shoes", text: "Bought shoes online, return window ends tomorrow, they fit but I don't love them — return or keep?", expect: /return|keep|window|tomorrow/i, maxMs: 8000 },
  { id: "salary-check", text: "Is $145k total comp good for a senior software engineer in Austin TX in 2026?", expect: /145|salary|austin|senior|range|market|comp/i, needSrc: true, maxMs: 15000 },
  { id: "forex-jpy", text: "How much is 10000 JPY in USD right now — exchange at the airport or before I fly?", expect: /jpy|usd|\$|exchange|airport|before|rate/i, needSrc: true, maxMs: 10000 },
  { id: "forex-eur", text: "Exchanging 800 USD to EUR for Paris next week — lock in now or wait?", expect: /eur|usd|now|wait|rate|exchange/i, needSrc: true, maxMs: 10000 },

  // —— Work / career ——
  { id: "quit-burnout", text: "Burned out with 3 months savings and no job lined up — quit Friday or stay and job-hunt while employed?", expect: /stay|quit|job|savings|hunt|employ|wait|leave/i, maxMs: 8000 },
  { id: "ask-raise", text: "Strong year, no raise — ask my manager this Thursday or wait for the annual review in 3 months?", expect: /ask|raise|review|week|prep|thursday|now/i, maxMs: 8000 },
  { id: "resign-text", text: "Should I quit my job by texting my boss tonight or schedule a meeting tomorrow?", expect: /meeting|in person|email|don't text|not text|schedule|tomorrow|professional/i, forbid: /yes,? text|text your boss tonight|go ahead and text/i, maxMs: 8000 },
  { id: "meeting-skip", text: "Optional product all-hands overlaps my deep-work block — attend or decline?", expect: /skip|decline|attend|optional|deep|protect/i, maxMs: 8000 },
  { id: "boss-email", text: "Boss sent a curt email about a bug I shipped — reply tonight apologizing or wait until morning with a fix plan?", expect: /morning|plan|fix|reply|wait|tonight/i, maxMs: 8000 },
  { id: "side-hustle", text: "Offer to freelancing nights for a competitor of my day job — take it or pass?", expect: /pass|conflict|no|don't|decline|risk|employer|contract/i, maxMs: 10000 },

  // —— Relationships / social ——
  { id: "late-text", text: "Running 12 minutes late to dinner with a friend — text now or just show up?", expect: /text|yes|message|now/i, maxMs: 6000 },
  { id: "ex-hey", text: "Ex texted 'hey' at 11:40pm after 4 months silent — reply tonight or leave it?", expect: /leave|wait|morning|don't|not tonight|ignore|space/i, maxMs: 6000 },
  { id: "cancel-drinks", text: "Exhausted after a brutal week; friends want drinks tonight — cancel politely or push through?", expect: /cancel|rest|politely|reschedule|go|push/i, maxMs: 6000 },
  { id: "inlaw-comment", text: "Mother-in-law made a dig about our apartment at dinner — confront tonight or talk to my spouse first?", expect: /spouse|partner|pause|tonight|confront|calm|wait|talk/i, maxMs: 6000 },
  { id: "wedding-rsvp", text: "Cousin wedding RSVP due Friday; flight would be $600 and I'm broke — say no, yes, or ask for more time?", expect: /no|rsvp|time|honest|ask|decline|afford/i, maxMs: 6000 },
  { id: "ghost-date", text: "Someone I matched with left me on read for 5 days then texted again — reply or move on?", expect: /reply|move|on|casual|low.?effort|don't chase|ghost/i, maxMs: 6000 },

  // —— Health / body ——
  { id: "melatonin", text: "Should I take melatonin every night for insomnia based on the research?", expect: /doctor|cautious|not every|guideline|melatonin|avoid|short.?term/i, needSrc: true, maxMs: 20000 },
  { id: "advil-tylenol", text: "Mild headache after dinner — Advil or Tylenol?", expect: /advil|tylenol|ibuprofen|acetaminophen|food|dose|either/i, needSrc: true, maxMs: 18000 },
  { id: "chest-tight", text: "Mild chest tightness twice this week after coffee — book a doctor or wait it out?", expect: /doctor|book|care|urgent|er|call|monitor|chest/i, maxMs: 8000 },
  { id: "gym-sick", text: "Slept 4 hours, scratchy throat, legs feel heavy — gym PR day or rest?", expect: /rest|skip|home|recover|not gym|don't/i, maxMs: 6000 },
  { id: "vaccine-flu", text: "Healthy 28yo — get the flu shot this week or skip another year?", expect: /get|shot|flu|vaccine|yes|worth|skip/i, needSrc: true, maxMs: 18000 },

  // —— Home / errands ——
  { id: "wool-stain", text: "Wool sweater got red wine on it before tomorrow's dinner — hand wash, rush dry clean, or wear something else?", expect: /dry.?clean|wear|else|wash|stain/i, maxMs: 6000 },
  { id: "fridge-hum", text: "Fridge started a new loud hum tonight — call a tech this week or wait a few days?", expect: /call|repair|tech|check|wait|fridge/i, maxMs: 6000 },
  { id: "laundry-now", text: "It's 11pm and I'm out of clean work shirts for tomorrow — wash now or wear yesterday's and wash tomorrow?", expect: /wash|wear|shirt|tonight|tomorrow/i, maxMs: 6000 },
  { id: "plant-dying", text: "Indoor plant leaves yellowing — water more, water less, or move to brighter light?", expect: /water|light|bright|less|more|check|soil/i, maxMs: 10000 },

  // —— Time / sleep / planning ——
  { id: "sleep-vs-email", text: "7am standup; it's 1:15am and one more Slack thread is open — sleep now or finish the reply?", expect: /sleep|now|morning|rest|tomorrow|email|slack/i, maxMs: 6000 },
  { id: "weekend-trip", text: "Friends planned a last-minute 3-hour drive Saturday; I promised myself a rest weekend — go or decline?", expect: /decline|rest|go|boundary|friend|weekend/i, maxMs: 6000 },
  { id: "alarm-snooze", text: "Alarm went off; I feel awful — snooze 20 more minutes or get up for a 25-min workout?", expect: /up|snooze|workout|sleep|rest|get/i, maxMs: 6000 },

  // —— Weather / outdoor ——
  { id: "picnic-sf", text: "Outdoor picnic in San Francisco this afternoon — rain likely? Stay outside or move indoors?", expect: /rain|indoor|outdoor|picnic|weather|clear|go|move/i, needSrc: true, maxMs: 12000 },
  { id: "umbrella-seattle", text: "What's the weather in Seattle today — do I need an umbrella for a 20-minute walk?", expect: /umbrella|rain|seattle|yes|no|weather/i, needSrc: true, maxMs: 10000 },

  // —— Holidays / convert / info ——
  { id: "memorial-day", text: "Is Memorial Day a US bank holiday — will my bank be closed?", expect: /memorial|yes|closed|holiday|bank/i, needSrc: true, maxMs: 8000 },
  { id: "boxing-day-uk", text: "Is Boxing Day a bank holiday in the UK?", expect: /boxing|yes|uk|britain|holiday|bank|public/i, needSrc: true, maxMs: 8000 },
  { id: "celsius-oven", text: "Recipe says bake at 180 celsius — what temperature for my US oven?", expect: /356|350|fahrenheit|°?f/i, maxMs: 8000 },
  { id: "nextjs-url", text: "What is https://github.com/vercel/next.js — should I use it for a tiny personal blog?", expect: /next|react|vercel|yes|no|consider|overkill|static/i, needSrc: true, maxMs: 15000 },
  { id: "news-markets", text: "Any big US market-moving headlines I should know before a finance interview this afternoon?", expect: /market|news|headline|fed|stock|oil|aware|quiet/i, needSrc: true, maxMs: 15000 },

  // —— Trap / edge cases (accuracy) ——
  { id: "comcast-fiber", text: "Should I switch from Comcast to a fiber ISP for price and reliability?", expect: /fiber|switch|comcast|isp|price|yes|no|compare/i, forbid: /uber|transit|walk|drive time|bart/i, maxMs: 12000 },
  { id: "tipping-point", text: "Am I at a tipping point in my career where I should leave management for IC work?", expect: /career|ic|management|leave|stay|consider/i, forbid: /gratuity|15%|20%|restaurant tip/i, maxMs: 10000 },
  { id: "pharmacy-near", text: "At Ferry Building SF — which nearby pharmacy is open-ish right now?", expect: /pharmacy|walgreens|cvs|ferry|open|closed|clarify/i, needSrc: true, maxMs: 18000 },

  // —— Classic commute regression ——
  { id: "ferry-twin", text: "Walk, transit, or Uber from Ferry Building to Twin Peaks in SF this evening?", expect: /transit|uber|walk|bus|drive/i, needSrc: true, maxMs: 20000 },
];

const JARGON =
  /\b(reach_search|plan_trip|find_nearby|prefetch(?:ed|ing)?|playbook|disclosed\s+prior|user_preference_conflict|OpenRouter|Agent-?Reach|OSRM|Nominatim|Overpass|Transitous|Open-?Meteo|Frankfurter|money_anxiety|risk_tolerance|web search|trip times|page read|Ling-?\d)\b/i;

async function runCase(c, attempt = 0) {
  const t0 = Date.now();
  let res;
  let data = {};
  try {
    res = await fetch(`${BASE}/api/decide`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ textSituation: c.text, history: [] }),
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    return {
      id: c.id,
      ok: false,
      ms: Date.now() - t0,
      status: "throw",
      sources: 0,
      rec: "",
      why: "",
      errors: [err instanceof Error ? err.message : String(err)],
    };
  }
  const ms = data.latencyMs || Date.now() - t0;
  const errText = String(data.error || "");
  const rateLimited =
    res.status === 429 ||
    /rate limit|free-models-per-min|empty or invalid decide JSON/i.test(errText);
  if (rateLimited && attempt < 3) {
    const wait = 7000 * (attempt + 1);
    console.log(`  ⟳ ${c.id} rate-limit, wait ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return runCase(c, attempt + 1);
  }

  const errors = [];
  if (!res.ok) errors.push(`http ${res.status}: ${errText.slice(0, 80)}`);
  const status = data.status;
  if (!status && !data.error) errors.push("no status");
  if (status === "clarify" && c.expect && !c.expect.test(JSON.stringify(data.clarifying_questions || []))) {
    // clarify ok only if we didn't hard-require decide content
  }
  const rec = data.recommendation || "";
  const why = data.why || "";
  const spoken = data.spoken_advice || "";
  const qs = JSON.stringify(data.clarifying_questions || []);
  const srcTitles = (data.sources || []).map((s) => s.title || "").join(" | ");
  const blob = `${rec} ${why} ${spoken} ${qs} ${srcTitles}`;

  if (status === "decide" && !rec.trim()) errors.push("empty recommendation");
  if (c.expect && status !== "clarify" && !c.expect.test(blob)) {
    errors.push(`expect miss: ${rec.slice(0, 70)}`);
  }
  if (c.forbid && c.forbid.test(blob)) {
    errors.push(`forbid hit: ${blob.match(c.forbid)?.[0]}`);
  }
  const j = JARGON.exec(blob);
  if (j) errors.push(`jargon: ${j[0]}`);
  const srcLen = (data.sources || []).length;
  if (c.needSrc && srcLen === 0 && status === "decide") errors.push("no sources");
  if (c.maxMs && ms > c.maxMs) errors.push(`slow ${ms}ms>${c.maxMs}`);
  if (why && why.length > 600) errors.push("why too long");
  if (spoken && spoken.split(/[.!?]/).filter(Boolean).length > 3) {
    errors.push("spoken too long");
  }

  return {
    id: c.id,
    ok: errors.length === 0,
    ms,
    status: status || "error",
    sources: srcLen,
    rec: rec.slice(0, 100),
    why: why.slice(0, 160),
    spoken: spoken.slice(0, 100),
    srcTitles: srcTitles.slice(0, 120),
    errors,
  };
}

async function main() {
  console.log(`stress-decide → ${BASE} (${CASES.length} cases)\n`);
  const rows = [];
  for (const c of CASES) {
    const r = await runCase(c);
    rows.push(r);
    const mark = r.ok ? "✓" : "✗";
    console.log(
      `${mark} ${r.id.padEnd(16)} ${String(r.ms).padStart(5)}ms src=${r.sources} ${(r.rec || r.status).slice(0, 55)}`
    );
    if (!r.ok) console.log(`    !! ${r.errors.join("; ")}`);
    await new Promise((r) => setTimeout(r, 2200));
  }

  const ok = rows.filter((r) => r.ok).length;
  const slow = rows.filter((r) => r.ms > 10000).length;
  const p50 = percentile(
    rows.map((r) => r.ms).sort((a, b) => a - b),
    0.5
  );
  const p90 = percentile(
    rows.map((r) => r.ms).sort((a, b) => a - b),
    0.9
  );
  console.log("\n=== SUMMARY ===");
  console.log(`pass ${ok}/${rows.length}`);
  console.log(`latency p50=${p50}ms p90=${p90}ms slow>10s=${slow}`);
  const fails = rows.filter((r) => !r.ok);
  if (fails.length) {
    console.log("\nFailures:");
    for (const f of fails) {
      console.log(`- ${f.id}: ${f.errors.join("; ")}`);
      console.log(`  rec: ${f.rec}`);
      console.log(`  why: ${f.why}`);
    }
  }

  const out = {
    at: new Date().toISOString(),
    base: BASE,
    pass: ok,
    total: rows.length,
    p50,
    p90,
    rows,
  };
  const fs = await import("node:fs");
  fs.writeFileSync("scripts/stress-decide-last.json", JSON.stringify(out, null, 2));
  console.log("\nWrote scripts/stress-decide-last.json");
  process.exit(ok === rows.length ? 0 : 1);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[i];
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
