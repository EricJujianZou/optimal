import fs from "node:fs";
import path from "node:path";

const CONTEXT_PATH = path.join(process.cwd(), "context.md");

// The template ships with HTML comments and unfilled bullet stubs. Until the
// owner actually fills it in there's nothing worth injecting, so we detect the
// pristine template and treat it as "no context" rather than feeding the model
// a wall of empty prompts.
function stripTemplate(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "") // drop HTML comments
    .replace(/^[-*]\s*.*:\s*$/gm, "") // drop empty "- Label:" stubs
    .replace(/^#.*$/gm, "") // drop headings
    .trim();
}

let cached: string | null | undefined;

/**
 * Reads the elicited persona from context.md and returns it verbatim for
 * injection into the system prompt. Returns null when the file is missing or
 * still the unfilled template. Cached after first read.
 */
export function loadContext(): string | null {
  if (cached !== undefined) return cached;

  try {
    const raw = fs.readFileSync(CONTEXT_PATH, "utf8");
    cached = stripTemplate(raw).length > 0 ? raw.trim() : null;
  } catch {
    cached = null;
  }

  return cached;
}
