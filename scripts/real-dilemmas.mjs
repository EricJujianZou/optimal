#!/usr/bin/env node
/**
 * Real-world dilemma battery — phrased like questions people actually ask.
 * Sources: Zurich “100 dreaded decisions” themes, raise/quit/tipping/ex/subscription
 * forums & columns, common daily life forks.
 *
 * Usage: node scripts/real-dilemmas.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3001";

/** @type {Array<{id:string,text:string,expect?:RegExp,forbid?:RegExp,maxMs?:number,needSrc?:boolean}>} */
const CASES = [
  // —— Career (Zurich #1 themes) ——
  {
    id: "accept-job",
    text: "I got a job offer that pays 18% more but means a 90-minute each-way commute and less interesting work — take it or stay?",
    expect: /stay|take|commute|offer|weigh|clarify|trade/i,
    maxMs: 10000,
  },
  {
    id: "quit-no-offer",
    text: "I've been miserable at work for a year. I have 5 months of savings and no offer yet — quit now or keep looking while employed?",
    expect: /stay|look|employ|hunt|quit|savings|wait/i,
    maxMs: 8000,
  },
  {
    id: "raise-after-win",
    text: "I just shipped a major project my boss praised in the all-hands. Annual review is in 10 weeks — ask for a raise this week or wait for the review?",
    expect: /ask|raise|week|review|prep|schedule|meeting/i,
    maxMs: 8000,
  },
  {
    id: "raise-after-layoff-news",
    text: "Company announced a hiring freeze yesterday. I've been underpaid for 2 years — still ask for a raise this month or wait?",
    expect: /wait|freeze|timing|hold|later|cautious|not this month/i,
    maxMs: 8000,
  },
  {
    id: "scope-creep-pay",
    text: "I've been doing my manager's job for 4 months with no title or pay bump — ask for a raise now, push for the title, or start interviewing?",
    expect: /ask|raise|title|interview|scope|conversation|meeting/i,
    maxMs: 8000,
  },
  {
    id: "freelance-vs-w2",
    text: "Stable W-2 vs freelancing at ~1.4x rate with no benefits and irregular clients — go freelance or stay?",
    expect: /stay|freelance|benefit|risk|runway|clarify|stable/i,
    maxMs: 10000,
  },

  // —— Money / finance ——
  {
    id: "invest-vs-cash",
    text: "I have $5,000 sitting in checking. Dump it into an S&P 500 index fund this week or keep a bigger cash buffer?",
    expect: /cash|buffer|invest|index|emergency|fund|hold|keep/i,
    maxMs: 12000,
  },
  {
    id: "meme-stock",
    text: "Friends are piling into a meme stock that's up 40% this week — FOMO buy $500 or sit it out?",
    expect: /sit|out|don't|not|avoid|cash|fomo|skip|wait/i,
    forbid: /buy now|all in|yolo/i,
    maxMs: 10000,
  },
  {
    id: "buy-vs-rent",
    text: "Rent is $2,400/mo. A condo I like is $620k with 10% down. Rates ~6.5%. Buy now or keep renting 2 more years?",
    expect: /rent|buy|rate|down|clarify|runway|afford|wait/i,
    maxMs: 12000,
  },
  {
    id: "cancel-unused-sub",
    text: "I pay for three streaming services and only opened one this month — cancel two tonight or keep all for 'someday'?",
    expect: /cancel|keep|stream|cut|two|tonight/i,
    maxMs: 7000,
  },
  {
    id: "credit-card-vs-debit",
    text: "Paying for a $1,200 laptop — put it on a 0% intro APR card for 12 months or debit from savings?",
    expect: /card|0%|apr|savings|debit|pay|interest/i,
    maxMs: 10000,
  },
  {
    id: "tip-delivery-rain",
    text: "DoorDash in heavy rain, $28 food total — tip $3, $5, or $8?",
    expect: /\$|tip|5|8|3|percent|deliver/i,
    needSrc: false,
    maxMs: 10000,
  },

  // —— Relationships ——
  {
    id: "ex-birthday",
    text: "My ex's birthday is tomorrow. We broke up 3 months ago amicably. Wish them happy birthday or stay silent?",
    expect: /birthday|wish|message|silent|don't|skip|brief|warm|space/i,
    maxMs: 7000,
  },
  {
    id: "partner-snoring",
    text: "Partner snores loudly and I'm wrecked. Raise it tonight or book a sleep study suggestion for the weekend?",
    expect: /raise|talk|sleep|study|gentle|tonight|weekend|partner/i,
    maxMs: 7000,
  },
  {
    id: "friend-owes-money",
    text: "Friend still owes me $180 from a trip two months ago. Ask again over text or let it go?",
    expect: /ask|text|owe|polite|remind|let it|go|money/i,
    maxMs: 7000,
  },
  {
    id: "wedding-broke",
    text: "Destination wedding in Mexico, flights ~$700, I'm paycheck-to-paycheck — RSVP no with a gift, or go and put it on a card?",
    expect: /no|rsvp|gift|don't|not go|decline|card|honest/i,
    maxMs: 7000,
  },
  {
    id: "meet-parents",
    text: "Dating 6 weeks. They want me to meet their parents this Sunday — say yes or wait until we're more serious?",
    expect: /wait|yes|meet|serious|six|week|boundary|suggest/i,
    maxMs: 7000,
  },

  // —— Health / body / daily ——
  {
    id: "sick-day",
    text: "Woke up with a fever of 100.8°F and a product demo at 2pm — call in sick or push through on Zoom?",
    expect: /sick|call|rest|home|don't|cancel|demo|reschedule/i,
    maxMs: 9000,
  },
  {
    id: "dentist-fear",
    text: "Tooth has ached mildly for a week. Dentist has an opening tomorrow or in 3 weeks — take tomorrow even if anxious?",
    expect: /tomorrow|dentist|book|go|week|soon/i,
    maxMs: 7000,
  },
  {
    id: "sleep-debt",
    text: "Averaging 5.5 hours sleep. Friends invited me out tonight until midnight — go or protect sleep?",
    expect: /sleep|protect|skip|rest|decline|go/i,
    maxMs: 6000,
  },
  {
    id: "ibuprofen-empty",
    text: "Mild backache after sitting all day — take ibuprofen now or stretch and wait an hour?",
    expect: /stretch|ibuprofen|wait|both|move|walk/i,
    maxMs: 12000,
  },

  // —— Home / logistics ——
  {
    id: "lease-renew",
    text: "Landlord offered a 1-year renewal at +8%. Market comps are flat. Sign, negotiate, or start looking?",
    expect: /negotiat|look|sign|market|counter|flat|8/i,
    maxMs: 10000,
  },
  {
    id: "car-repair",
    text: "Check engine light just came on before a 4-hour road trip this weekend — get it checked Friday or drive and hope?",
    expect: /check|friday|mechanic|don't|not drive|shop|diagnose/i,
    forbid: /drive and hope|just go/i,
    maxMs: 8000,
  },
  {
    id: "grocery-now",
    text: "Fridge is basically empty, it's 9:40pm, stores close at 10 — go now or order expensive delivery?",
    expect: /go|store|delivery|now|tonight|order/i,
    maxMs: 6000,
  },

  // —— Info / timed facts ——
  {
    id: "weather-umbrella-nyc",
    text: "What's the weather in New York City this afternoon — do I need an umbrella for a 15-minute walk to lunch?",
    expect: /umbrella|rain|yes|no|weather|nyc|clear|cloud/i,
    needSrc: true,
    maxMs: 10000,
  },
  {
    id: "usd-gbp",
    text: "Converting 1200 USD to GBP for a London trip in 10 days — exchange now or at the airport?",
    expect: /now|airport|gbp|usd|rate|atm|before/i,
    needSrc: true,
    maxMs: 10000,
  },
  {
    id: "thanksgiving-bank",
    text: "Is Thanksgiving Day a US bank holiday — will my bank's lobby be open?",
    expect: /thanksgiving|closed|holiday|yes|no|bank/i,
    needSrc: true,
    maxMs: 8000,
  },
  {
    id: "oven-gas-mark",
    text: "British recipe says gas mark 6 — what's that in Fahrenheit for my US oven?",
    expect: /400|fahrenheit|°?f|gas/i,
    maxMs: 8000,
  },

  // —— Traps ——
  {
    id: "from-gmail-to-outlook",
    text: "Should I switch from Gmail to Outlook for work email organization and search?",
    expect: /outlook|gmail|switch|stay|depend|try|organiz/i,
    forbid: /uber|transit|walk time|bart|ferry/i,
    maxMs: 10000,
  },
  {
    id: "tipping-culture-rant",
    text: "I'm tired of tipping culture — should I tip 0% at a full-service US restaurant on a $60 bill to make a point?",
    expect: /tip|15|18|20|not 0|don't|staff|point|hurt/i,
    forbid: /\b(tip 0% to make a point|leave (a )?\$?0 tip|tip nothing|zero tip on purpose)\b/i,
    maxMs: 10000,
  },
];

const JARGON =
  /\b(reach_search|plan_trip|find_nearby|prefetch|playbook|OpenRouter|OSRM|Nominatim|Overpass|Open-?Meteo|Frankfurter|money_anxiety|web search|trip times)\b/i;

async function runCase(c, attempt = 0) {
  const t0 = Date.now();
  let res, data = {};
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
  if (
    (res.status === 429 ||
      /rate limit|free-models-per-min|empty or invalid/i.test(errText)) &&
    attempt < 3
  ) {
    const wait = 7000 * (attempt + 1);
    console.log(`  ⟳ ${c.id} wait ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return runCase(c, attempt + 1);
  }
  const errors = [];
  if (!res.ok) errors.push(`http ${res.status}: ${errText.slice(0, 80)}`);
  const status = data.status || "error";
  const rec = data.recommendation || "";
  const why = data.why || "";
  const spoken = data.spoken_advice || "";
  const qs = (data.clarifying_questions || []).join(" ");
  const srcTitles = (data.sources || []).map((s) => s.title || "").join(" | ");
  const blob = `${rec} ${why} ${spoken} ${qs} ${srcTitles}`;
  if (status === "decide" && !rec.trim()) errors.push("empty rec");
  if (c.expect && status === "decide" && !c.expect.test(blob)) {
    errors.push(`expect: ${rec.slice(0, 70)}`);
  }
  if (c.expect && status === "clarify" && !c.expect.test(blob + qs)) {
    // clarify can still satisfy expect via questions
    if (!c.expect.test(qs)) errors.push(`clarify miss: ${qs.slice(0, 70)}`);
  }
  if (c.forbid && c.forbid.test(blob)) {
    errors.push(`forbid: ${blob.match(c.forbid)?.[0]}`);
  }
  const j = JARGON.exec(blob);
  if (j) errors.push(`jargon: ${j[0]}`);
  if (c.needSrc && status === "decide" && !(data.sources || []).length) {
    errors.push("no sources");
  }
  if (c.maxMs && ms > c.maxMs) errors.push(`slow ${ms}>${c.maxMs}`);
  return {
    id: c.id,
    ok: errors.length === 0,
    ms,
    status,
    sources: (data.sources || []).length,
    rec: (rec || qs).slice(0, 110),
    why: why.slice(0, 140),
    errors,
  };
}

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function main() {
  console.log(`real-dilemmas → ${BASE} (${CASES.length} cases)\n`);
  const rows = [];
  for (const c of CASES) {
    const r = await runCase(c);
    rows.push(r);
    console.log(
      `${r.ok ? "✓" : "✗"} ${r.id.padEnd(22)} ${String(r.ms).padStart(5)}ms ${r.status} ${(r.rec || "").slice(0, 52)}`
    );
    if (!r.ok) console.log(`    !! ${r.errors.join("; ")}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  const ok = rows.filter((r) => r.ok).length;
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`\npass ${ok}/${rows.length}  p50=${pct(ms, 0.5)}ms p90=${pct(ms, 0.9)}ms`);
  const fs = await import("node:fs");
  fs.writeFileSync(
    "scripts/real-dilemmas-last.json",
    JSON.stringify(
      { at: new Date().toISOString(), pass: ok, total: rows.length, rows },
      null,
      2
    )
  );
  process.exit(ok === rows.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
