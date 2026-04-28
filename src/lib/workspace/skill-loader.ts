import fs from "node:fs";
import path from "node:path";

/**
 * Skill loader for the CRE Chatbot.
 *
 * Reads .md files from src/skills/ at request time and returns the
 * subset that applies to the current asset type. Each skill has YAML-ish
 * frontmatter:
 *
 *   ---
 *   name: CRE Underwriting Rules
 *   description: Cap rate ranges, NOI normalization, debt sizing math.
 *   applies_to: ["*"]
 *   ---
 *
 *   <markdown body>
 *
 * Frontmatter fields:
 *   name        - short label, used in the prompt header
 *   description - one-liner shown alongside the name
 *   applies_to  - JSON array of asset types this skill is relevant for.
 *                 Use ["*"] to apply to every deal. Use specific types
 *                 like ["land"] or ["retail", "industrial"] to scope.
 *
 * Skills get concatenated into the system prompt under a SKILLS section
 * so the LLM treats them as authoritative reference material.
 *
 * To add a new skill: drop a .md file into src/skills/. No code change
 * needed - the loader reads the directory on every request (this is
 * tiny per-skill so the cost is negligible).
 */

export interface Skill {
  filename: string;
  name: string;
  description: string;
  appliesTo: string[];
  body: string;
}

/** Parse the leading YAML-ish frontmatter from a markdown file. */
function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, any> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!kv) continue;
    const key = kv[1];
    let val: any = kv[2].trim();
    // Try JSON for arrays / objects / quoted strings.
    if (val.startsWith("[") || val.startsWith("{") || val.startsWith('"')) {
      try { val = JSON.parse(val); } catch { /* fall through to raw string */ }
    }
    meta[key] = val;
  }
  return { meta, body: m[2].trim() };
}

let cachedSkills: Skill[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/** Read every .md file under src/skills/ and parse it. */
export function loadAllSkills(): Skill[] {
  // Per-request file reads would be wasteful but a 30s cache is plenty
  // for production where deploys swap the bundle anyway.
  if (cachedSkills && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedSkills;
  }

  const dir = path.join(process.cwd(), "src", "skills");
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md"));
  } catch {
    cachedSkills = [];
    cachedAt = Date.now();
    return [];
  }

  const skills: Skill[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { meta, body } = parseFrontmatter(raw);
      if (!body) continue;
      const appliesTo = Array.isArray(meta.applies_to)
        ? meta.applies_to.map(String)
        : ["*"];
      skills.push({
        filename: f,
        name: String(meta.name || f.replace(/\.md$/i, "")),
        description: String(meta.description || ""),
        appliesTo,
        body,
      });
    } catch (err: any) {
      console.warn(`[skill-loader] Failed to read ${f}:`, err?.message);
    }
  }

  cachedSkills = skills;
  cachedAt = Date.now();
  return skills;
}

/** Return only the skills that should fire for this asset type. */
export function getSkillsForAssetType(assetType: string | undefined | null): Skill[] {
  const t = (assetType || "").toLowerCase();
  return loadAllSkills().filter((s) => {
    if (!s.appliesTo || s.appliesTo.length === 0) return true;
    if (s.appliesTo.includes("*")) return true;
    return s.appliesTo.map((a) => a.toLowerCase()).includes(t);
  });
}

/** Render the matched skills into a single markdown block ready to
 *  paste into the system prompt. */
export function renderSkillsBlock(assetType: string | undefined | null): string {
  const matched = getSkillsForAssetType(assetType);
  if (matched.length === 0) return "";
  const sections = matched.map((s) => {
    const head = `## ${s.name}${s.description ? ` — ${s.description}` : ""}`;
    return `${head}\n\n${s.body}`;
  });
  return `\nSKILLS (reference these when relevant)\n======================================\n${sections.join("\n\n")}\n`;
}
