import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { NewSession, SessionRow } from "./types";

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
  `);

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
