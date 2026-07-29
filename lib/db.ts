import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  DecisionRow,
  NewDecisionRecord,
  NewSession,
  ProfileEventRow,
  ProfileRow,
  SessionRow,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "optimal.db");

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sleep_hours REAL NOT NULL,
      days_on_diet INTEGER NOT NULL,
      hunger_level INTEGER NOT NULL,
      adherence_streak_days INTEGER NOT NULL,
      transcript TEXT NOT NULL,
      craving_intensity INTEGER NOT NULL,
      temptation_type TEXT NOT NULL,
      context_tags TEXT NOT NULL,
      reasoning_trace TEXT NOT NULL,
      intervention_text TEXT NOT NULL,
      decision TEXT NOT NULL,
      user_note TEXT NOT NULL DEFAULT '',
      latency_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      summary TEXT NOT NULL DEFAULT '',
      prefs_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profile_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      decision_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      transcript TEXT NOT NULL,
      extra_context TEXT NOT NULL DEFAULT '',
      options_json TEXT NOT NULL,
      options_source TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      why TEXT NOT NULL,
      alternatives_json TEXT NOT NULL,
      confidence REAL NOT NULL,
      spoken_advice TEXT NOT NULL,
      latency_ms INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migrate older DBs missing prefs_json before any profile writes.
  const cols = db.prepare("PRAGMA table_info(profile)").all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "prefs_json")) {
    db.exec(
      `ALTER TABLE profile ADD COLUMN prefs_json TEXT NOT NULL DEFAULT '{}'`
    );
  }

  // Ensure single profile row exists (N=1 lab).
  db.prepare(
    "INSERT OR IGNORE INTO profile (id, summary, prefs_json) VALUES (1, '', '{}')"
  ).run();

  return db;
}

export function insertSession(row: NewSession): SessionRow {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO sessions (
      sleep_hours, days_on_diet, hunger_level, adherence_streak_days,
      transcript, craving_intensity, temptation_type, context_tags,
      reasoning_trace, intervention_text, decision, user_note, latency_ms
    ) VALUES (
      @sleep_hours, @days_on_diet, @hunger_level, @adherence_streak_days,
      @transcript, @craving_intensity, @temptation_type, @context_tags,
      @reasoning_trace, @intervention_text, @decision, @user_note, @latency_ms
    )
  `);

  const info = stmt.run({
    sleep_hours: row.sleep_hours,
    days_on_diet: row.days_on_diet,
    hunger_level: row.hunger_level,
    adherence_streak_days: row.adherence_streak_days,
    transcript: row.transcript,
    craving_intensity: row.craving_intensity,
    temptation_type: row.temptation_type,
    context_tags: JSON.stringify(row.context_tags),
    reasoning_trace: row.reasoning_trace,
    intervention_text: row.intervention_text,
    decision: row.decision,
    user_note: row.user_note,
    latency_ms: row.latency_ms,
  });

  return getSessionById(info.lastInsertRowid as number)!;
}

export function getSessionById(id: number): SessionRow | undefined {
  const database = getDb();
  return database
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(id) as SessionRow | undefined;
}

export function listSessions(): SessionRow[] {
  const database = getDb();
  return database
    .prepare("SELECT * FROM sessions ORDER BY id DESC")
    .all() as SessionRow[];
}

const CSV_COLUMNS: (keyof SessionRow)[] = [
  "id",
  "created_at",
  "sleep_hours",
  "days_on_diet",
  "hunger_level",
  "adherence_streak_days",
  "transcript",
  "craving_intensity",
  "temptation_type",
  "context_tags",
  "reasoning_trace",
  "intervention_text",
  "decision",
  "user_note",
  "latency_ms",
];

function csvEscape(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function sessionsToCsv(): string {
  const rows = listSessions();
  const header = CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    CSV_COLUMNS.map((col) => csvEscape(row[col])).join(",")
  );
  return [header, ...lines].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────
// Profile (general decisions)
// ─────────────────────────────────────────────────────────────────────────

export function getProfile(): ProfileRow {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM profile WHERE id = 1")
    .get() as ProfileRow & { prefs_json?: string };
  return {
    ...row,
    prefs_json: row.prefs_json ?? "{}",
  };
}

export function getProfilePrefs(): import("./types").ProfilePrefs {
  try {
    const raw = JSON.parse(getProfile().prefs_json || "{}");
    return (raw && typeof raw === "object" ? raw : {}) as import("./types").ProfilePrefs;
  } catch {
    return {};
  }
}

export function setProfilePrefs(
  patch: import("./types").ProfilePrefs
): import("./types").ProfilePrefs {
  const database = getDb();
  const current = getProfilePrefs();
  const next = { ...current, ...patch };
  database
    .prepare(
      `UPDATE profile SET prefs_json = ?, updated_at = datetime('now') WHERE id = 1`
    )
    .run(JSON.stringify(next));
  return next;
}

export function formatPrefsBlock(prefs: import("./types").ProfilePrefs): string {
  const lines: string[] = [];
  if (prefs.risk_tolerance === "low") lines.push("Prefers lower risk.");
  else if (prefs.risk_tolerance === "high")
    lines.push("Comfortable with higher risk.");
  else if (prefs.risk_tolerance === "medium")
    lines.push("Moderate risk appetite.");
  if (prefs.money_anxiety === "high")
    lines.push("Money stress runs high — be gentle and concrete.");
  else if (prefs.money_anxiety === "low")
    lines.push("Usually calm about money.");
  else if (prefs.money_anxiety === "medium")
    lines.push("Average money anxiety.");
  if (prefs.default_tip_pct != null) {
    lines.push(`Usual tip about ${prefs.default_tip_pct}%.`);
  }
  if (prefs.home_label) lines.push(`Home area: ${prefs.home_label}.`);
  if (prefs.work_label) lines.push(`Work area: ${prefs.work_label}.`);
  if (prefs.lat != null && prefs.lon != null) {
    lines.push(
      `Approx location: ${prefs.lat.toFixed(4)}, ${prefs.lon.toFixed(4)}.`
    );
  }
  if (prefs.hard_constraints)
    lines.push(`Hard constraints: ${prefs.hard_constraints}`);
  return lines.join(" ");
}

export function setProfileSummary(summary: string): ProfileRow {
  const database = getDb();
  database
    .prepare(
      `UPDATE profile SET summary = ?, updated_at = datetime('now') WHERE id = 1`
    )
    .run(summary);
  return getProfile();
}

export function insertProfileEvent(args: {
  kind: string;
  content: string;
  decision_id?: number | null;
}): ProfileEventRow {
  const database = getDb();
  const info = database
    .prepare(
      `INSERT INTO profile_events (kind, content, decision_id)
       VALUES (@kind, @content, @decision_id)`
    )
    .run({
      kind: args.kind,
      content: args.content,
      decision_id: args.decision_id ?? null,
    });
  return database
    .prepare("SELECT * FROM profile_events WHERE id = ?")
    .get(info.lastInsertRowid) as ProfileEventRow;
}

export function listProfileEvents(limit = 50): ProfileEventRow[] {
  const database = getDb();
  return database
    .prepare(
      "SELECT * FROM profile_events ORDER BY id DESC LIMIT ?"
    )
    .all(limit) as ProfileEventRow[];
}

export function deleteProfileEvent(id: number): boolean {
  const database = getDb();
  const info = database
    .prepare("DELETE FROM profile_events WHERE id = ?")
    .run(id);
  return info.changes > 0;
}

/** Wipe lasting memory + event log (keeps decisions history). */
export function clearProfileMemory(): ProfileRow {
  const database = getDb();
  database.prepare("DELETE FROM profile_events").run();
  database
    .prepare(
      `UPDATE profile SET summary = '', prefs_json = '{}', updated_at = datetime('now') WHERE id = 1`
    )
    .run();
  return getProfile();
}

// ─────────────────────────────────────────────────────────────────────────
// Decisions (general)
// ─────────────────────────────────────────────────────────────────────────

export function insertDecision(row: NewDecisionRecord): DecisionRow {
  const database = getDb();
  const info = database
    .prepare(
      `INSERT INTO decisions (
        transcript, extra_context, options_json, options_source,
        recommendation, why, alternatives_json, confidence,
        spoken_advice, latency_ms
      ) VALUES (
        @transcript, @extra_context, @options_json, @options_source,
        @recommendation, @why, @alternatives_json, @confidence,
        @spoken_advice, @latency_ms
      )`
    )
    .run({
      transcript: row.transcript,
      extra_context: row.extra_context,
      options_json: JSON.stringify(row.options),
      options_source: row.options_source,
      recommendation: row.recommendation,
      why: row.why,
      alternatives_json: JSON.stringify(row.alternatives),
      confidence: row.confidence,
      spoken_advice: row.spoken_advice,
      latency_ms: row.latency_ms,
    });

  return getDecisionById(info.lastInsertRowid as number)!;
}

export function getDecisionById(id: number): DecisionRow | undefined {
  const database = getDb();
  return database
    .prepare("SELECT * FROM decisions WHERE id = ?")
    .get(id) as DecisionRow | undefined;
}

export function listDecisions(limit = 100): DecisionRow[] {
  const database = getDb();
  return database
    .prepare("SELECT * FROM decisions ORDER BY id DESC LIMIT ?")
    .all(limit) as DecisionRow[];
}
