#!/usr/bin/env node
/**
 * Golden eval harness for /api/decide (JSON Accept).
 * Broad real-world daily dilemmas — not travel-only.
 * Usage: node scripts/eval-decide.mjs [baseUrl]
 */
const BASE = process.argv[2] || "http://localhost:3001";

/** @type {Array<{id:string,text:string,expectStatus?:string|null,needSources?:boolean,rec:RegExp}>} */
const CASES = [
  // —— Money / etiquette ——
  {
    id: "tip",
    text: "How much should I tip on an $80 US restaurant bill?",
    expectStatus: "decide",
    needSources: true,
    rec: /tip|\$|15|20|12|16/i,
  },
  {
    id: "split-bill",
    text: "Dinner was $120 for three friends — should we split evenly or each pay for what we ordered?",
    expectStatus: "decide",
    needSources: false,
    rec: /split|even|order|pay|each|fair/i,
  },
  {
    id: "money-spare",
    text: "Should I put spare $200 into a speculative trade right now or keep cash?",
    expectStatus: "decide",
    needSources: true,
    rec: /cash|keep|wait|risk|spare|invest|hold/i,
  },
  {
    id: "cancel-sub",
    text: "I barely use my $15/month streaming subscription — cancel now or keep it another month?",
    expectStatus: "decide",
    needSources: false,
    rec: /cancel|keep|month|stream|use|subscribe/i,
  },
  {
    id: "buy-now",
    text: "This jacket is 40% off today only at $90 — buy it now or wait for a bigger sale?",
    expectStatus: "decide",
    needSources: false,
    rec: /buy|wait|sale|need|jacket|off|pass/i,
  },
  {
    id: "forex",
    text: "I'm exchanging 500 USD to EUR for a trip next week — do it now or wait?",
    expectStatus: "decide",
    needSources: true,
    rec: /eur|usd|exchange|rate|now|wait|trip/i,
  },

  // —— Work / career ——
  {
    id: "quit-job",
    text: "I'm burned out with 2 months of savings and no next job lined up — quit tomorrow or stay?",
    expectStatus: "decide",
    needSources: false,
    rec: /stay|quit|job|savings|burnout|income|wait|leave/i,
  },
  {
    id: "ask-raise",
    text: "I've been performing above expectations for a year with no raise — ask my manager this week or wait for review?",
    expectStatus: "decide",
    needSources: false,
    rec: /ask|raise|review|manager|wait|week|prep|meeting/i,
  },
  {
    id: "meeting-rsvp",
    text: "Optional all-hands conflicts with deep work time I protected — RSVP yes or skip?",
    expectStatus: "decide",
    needSources: false,
    rec: /skip|rsvp|attend|optional|work|meeting|protect/i,
  },
  {
    id: "reply-email",
    text: "Got a curt email from my boss about a missed deadline — reply tonight apologizing or wait until morning with a fix plan?",
    expectStatus: "decide",
    needSources: false,
    rec: /reply|morning|tonight|apolog|plan|fix|wait/i,
  },

  // —— Relationships / social ——
  {
    id: "personal-late",
    text: "Should I text my friend I am 10 min late?",
    expectStatus: "decide",
    needSources: false,
    rec: /text|yes|message/i,
  },
  {
    id: "inlaw",
    text: "Should I confront my mother-in-law about the comment she made at dinner?",
    expectStatus: "decide",
    needSources: false,
    rec: /confront|pause|boundary|spouse|calm|harmony|comment|hold/i,
  },
  {
    id: "cancel-plans",
    text: "I'm exhausted and said yes to drinks tonight — cancel politely or push through?",
    expectStatus: "decide",
    needSources: false,
    rec: /cancel|go|rest|politely|reschedule|push|stay/i,
  },
  {
    id: "ex-text",
    text: "My ex just texted 'hey' at 11pm after months of silence — reply tonight or leave it?",
    expectStatus: "decide",
    needSources: false,
    rec: /reply|leave|wait|morning|ignore|don't|not|space/i,
  },
  {
    id: "invite-rsvp",
    text: "Wedding invite RSVP due Friday and I'm unsure if I can afford the trip — say yes, no, or ask for more time?",
    expectStatus: "decide",
    needSources: false,
    rec: /rsvp|yes|no|time|afford|ask|wedding|honest/i,
  },

  // —— Health / body ——
  {
    id: "melatonin",
    text: "Should I take melatonin every night for sleep based on research evidence?",
    expectStatus: null,
    needSources: true,
    rec: /melatonin|sleep|guideline|night|not|cautious|doctor|avoid/i,
  },
  {
    id: "skip-gym",
    text: "Slept 5 hours and my throat feels scratchy — go to the gym or rest today?",
    expectStatus: "decide",
    needSources: false,
    rec: /rest|gym|skip|sleep|throat|recover|home|today/i,
  },
  {
    id: "doctor",
    text: "Mild chest tightness after coffee twice this week — book a doctor visit or monitor a few more days?",
    expectStatus: "decide",
    needSources: false,
    rec: /doctor|monitor|urgent|chest|book|care|er|call|symptom/i,
  },

  // —— Home / errands ——
  {
    id: "laundry",
    text: "Wool sweater got a stain before a dinner tomorrow — hand wash tonight, dry clean rush, or wear something else?",
    expectStatus: "decide",
    needSources: false,
    rec: /wear|else|dry.?clean|wash|stain|sweater|another|outfit/i,
  },
  {
    id: "appliance",
    text: "Fridge is making a new loud hum — call a repair tech this week or wait and see if it stops?",
    expectStatus: "decide",
    needSources: false,
    rec: /repair|wait|call|tech|fridge|hum|check|service/i,
  },
  {
    id: "return-item",
    text: "Bought headphones online, return window closes in 2 days, sound is fine but fit is meh — return or keep?",
    expectStatus: "decide",
    needSources: false,
    rec: /return|keep|window|fit|refund|days/i,
  },

  // —— Time / planning ——
  {
    id: "sleep-alarm",
    text: "I have a 7am meeting and it's 12:30am — sleep now or finish this one more email?",
    expectStatus: "decide",
    needSources: false,
    rec: /sleep|email|morning|rest|now|finish|tomorrow/i,
  },
  {
    id: "weekend-plan",
    text: "Friends want a last-minute road trip Saturday and I promised myself a rest weekend — go or decline?",
    expectStatus: "decide",
    needSources: false,
    rec: /decline|go|rest|trip|boundary|friend|weekend/i,
  },
  {
    id: "holiday-bank",
    text: "Is Memorial Day a US bank holiday and will banks be closed?",
    expectStatus: "decide",
    needSources: true,
    rec: /memorial|holiday|bank|closed|yes|no/i,
  },

  // —— Weather / outdoor (light travel, not route planning) ——
  {
    id: "picnic-weather",
    text: "Planning an outdoor picnic in San Francisco this afternoon — check if rain is likely and should we move indoors?",
    expectStatus: "decide",
    needSources: true,
    rec: /rain|indoor|outdoor|picnic|weather|umbrella|go|move|forecast/i,
  },

  // —— Info / tech / news ——
  {
    id: "github-url",
    text: "What is https://github.com/vercel/next.js and should I use it for a small app?",
    expectStatus: "decide",
    needSources: true,
    rec: /next\.?js|vercel|react|framework|yes|use|consider/i,
  },
  {
    id: "convert-temp",
    text: "Recipe says bake at 180 celsius — what's that in fahrenheit for my US oven?",
    expectStatus: "decide",
    needSources: false,
    rec: /356|350|fahrenheit|°?f|oven|180/i,
  },
  {
    id: "entity-otc",
    text: "What is ibuprofen and is it okay to take with a mild headache after dinner?",
    expectStatus: null,
    needSources: true,
    rec: /ibuprofen|headache|dose|food|pain|nsaid|doctor|yes|ok|avoid/i,
  },
  {
    id: "news-brief",
    text: "Any major US market-moving headlines I should know before a job interview about finance today?",
    expectStatus: null,
    needSources: true,
    rec: /market|news|headline|interview|finance|today|aware|none|quiet/i,
  },

  // —— Keep a couple travel cases (regression) ——
  {
    id: "commute",
    text: "Walk, transit, or Uber from Ferry Building to Twin Peaks SF this evening?",
    expectStatus: "decide",
    needSources: true,
    rec: /transit|uber|walk|drive/i,
  },
  {
    id: "nearby",
    text: "At Ferry Building SF — which nearby cafe for coffee right now?",
    expectStatus: null,
    needSources: true,
    rec: /cafe|coffee|closed|open|ferry|blue|philz|bottle|clarify|search/i,
  },
];

async function runCase(c, attempt = 0) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/decide`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ textSituation: c.text, history: [] }),
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  const errText = String(data.error || "");
  const rateLimited =
    res.status === 429 ||
    /rate limit|free-models-per-min|empty or invalid decide JSON/i.test(errText);
  if (rateLimited && attempt < 3) {
    const wait = 8000 * (attempt + 1);
    console.log(`  ⟳ ${c.id} retry in ${wait}ms (${errText.slice(0, 60) || res.status})`);
    await new Promise((r) => setTimeout(r, wait));
    return runCase(c, attempt + 1);
  }
  const errors = [];
  if (!res.ok) errors.push(`http ${res.status}: ${data.error || "?"}`);
  const status = data.status;
  if (c.expectStatus && status !== c.expectStatus) {
    errors.push(`status=${status} want ${c.expectStatus}`);
  }
  const rec = data.recommendation || data.spoken_advice || "";
  const why = data.why || "";
  const spoken = data.spoken_advice || "";
  const srcTitles = (data.sources || []).map((s) => s.title || "").join(" ");
  const blob = `${rec} ${JSON.stringify(data.clarifying_questions || [])} ${why} ${spoken} ${srcTitles}`;
  if (c.rec && !c.rec.test(blob)) {
    errors.push(`rec miss: ${(rec || "").slice(0, 80)}`);
  }
  const jargon =
    /\b(reach_search|plan_trip|find_nearby|prefetch(?:ed|ing)?|playbook|disclosed\s+prior|user_preference_conflict|OpenRouter|Agent-?Reach|OSRM|Nominatim|Overpass|Transitous|Open-?Meteo|money_anxiety|risk_tolerance|web search|trip times|page read)\b/i;
  if (jargon.test(blob)) {
    errors.push(`jargon leak: ${blob.match(jargon)?.[0]}`);
  }
  const srcLen = (data.sources || []).length;
  if (c.needSources && srcLen === 0) errors.push("no sources");
  return {
    id: c.id,
    ok: errors.length === 0,
    ms: data.latencyMs || ms,
    status: status || "error",
    sources: srcLen,
    rec: (rec || "").slice(0, 70),
    errors,
  };
}

async function main() {
  console.log(`eval-decide → ${BASE} (${CASES.length} cases)`);
  const rows = [];
  // Sequential + gap — free OpenRouter rate limits crush parallel runs.
  for (const c of CASES) {
    try {
      const r = await runCase(c);
      rows.push(r);
      console.log(
        `${r.ok ? "✓" : "✗"} ${r.id} ${r.ms}ms src=${r.sources} ${(r.rec || "").slice(0, 50)}`
      );
    } catch (err) {
      rows.push({
        id: c.id,
        ok: false,
        ms: 0,
        status: "throw",
        sources: 0,
        rec: "",
        errors: [err instanceof Error ? err.message : String(err)],
      });
      console.log(`✗ ${c.id} throw`);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }

  console.table(
    rows.map((r) => ({
      id: r.id,
      ok: r.ok,
      ms: r.ms,
      status: r.status,
      sources: r.sources,
      rec: r.rec,
      errors: r.errors.join("; "),
    }))
  );
  const failed = rows.filter((r) => !r.ok);
  const avg =
    rows.reduce((s, r) => s + (r.ms || 0), 0) / Math.max(1, rows.length);
  console.log(
    `avg ${Math.round(avg)}ms | pass ${rows.length - failed.length}/${rows.length}`
  );
  if (failed.length) {
    console.error(`FAILED ${failed.length}/${rows.length}`);
    for (const f of failed) {
      console.error(` - ${f.id}: ${f.errors.join("; ")}`);
    }
    process.exit(1);
  }
  console.log(`PASS ${rows.length}/${rows.length}`);
}

main();
