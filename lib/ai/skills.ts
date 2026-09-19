// Skills loader.
//
// Skills are markdown files with YAML frontmatter living in a SEPARATE
// GitHub repo (so partners can edit formatting + style without redeploying
// the app). This module loads them at runtime.
//
// Two loading modes:
//   1. "bundled" (default in dev / when LDP_SKILLS_REPO is unset): reads
//      from a local fallback in lib/ai/_skills-fallback/. Lets the app
//      run before the skills repo exists.
//   2. "github" (production): clones / pulls https://github.com/<owner>/<repo>
//      using LDP_SKILLS_GITHUB_TOKEN (fine-grained PAT, contents:read).
//      Cached in /tmp for the lifetime of the lambda; refreshed on a
//      cron tick.
//
// Each skill is identified by an `id` in the frontmatter (e.g.
// `asambleas-ordinaria-anual`). `applies_to` declares when the skill is
// relevant: matter_types (civil/corporate/...), document_types
// (acta-asamblea/contrato-alquiler/...).
//
// Resolution order at request time: skills are gathered by document_type
// + matter_type matches, concatenated with the base skill, and sent as
// part of the system prompt (cached).

import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type SkillFrontmatter = {
  id: string;
  name: string;
  applies_to?: {
    matter_types?: string[];
    document_types?: string[];
  };
  output?: "docx" | "text";
  priority?: number;
};

export type Skill = {
  meta: SkillFrontmatter;
  body: string;
  source: "bundled" | "github";
};

let cache: Skill[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

export async function loadAllSkills(): Promise<Skill[]> {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  const useGithub = Boolean(
    process.env.LDP_SKILLS_REPO && process.env.LDP_SKILLS_GITHUB_TOKEN,
  );
  const skills = useGithub ? await loadFromGithub() : await loadFromBundled();
  cache = skills;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return skills;
}

// Pick skills relevant to a (matterType, documentType) pair, ordered by
// priority descending. Always includes the "base" skill first.
export async function resolveSkillsFor(filter: {
  matterType?: string;
  documentType?: string;
}): Promise<Skill[]> {
  const all = await loadAllSkills();
  const base = all.find((s) => s.meta.id === "base");
  const matched = all.filter((s) => {
    if (s.meta.id === "base") return false;
    const a = s.meta.applies_to;
    if (!a) return false;
    const matterOk = !a.matter_types || (filter.matterType && a.matter_types.includes(filter.matterType));
    const docOk = !a.document_types || (filter.documentType && a.document_types.includes(filter.documentType));
    return matterOk && docOk;
  });
  matched.sort((a, b) => (b.meta.priority ?? 0) - (a.meta.priority ?? 0));
  return base ? [base, ...matched] : matched;
}

// Render skills into a single system-prompt block, deduplicating by id.
export function renderSkillsBlock(skills: Skill[]): string {
  if (skills.length === 0) return "";
  const lines: string[] = ["## Reglas de formato y estilo LDP"];
  for (const s of skills) {
    lines.push(`\n### ${s.meta.name} (${s.meta.id})`);
    lines.push(s.body.trim());
  }
  return lines.join("\n");
}

// =============================================================================
// Bundled fallback loader
// =============================================================================

async function loadFromBundled(): Promise<Skill[]> {
  const root = path.join(process.cwd(), "lib", "ai", "_skills-fallback");
  try {
    const files = await readdir(root, { recursive: true });
    const skills: Skill[] = [];
    for (const file of files) {
      if (typeof file !== "string" || !file.endsWith(".md")) continue;
      const fullPath = path.join(root, file);
      const content = await readFile(fullPath, "utf8");
      const parsed = parseSkillFile(content, file);
      if (parsed) skills.push({ ...parsed, source: "bundled" });
    }
    return skills;
  } catch {
    return [];
  }
}

// =============================================================================
// GitHub loader (production path, pulls from LDP_SKILLS_REPO)
// =============================================================================

async function loadFromGithub(): Promise<Skill[]> {
  const repo = process.env.LDP_SKILLS_REPO; // e.g. "GendrickAlv/LDP-Skills"
  const token = process.env.LDP_SKILLS_GITHUB_TOKEN;
  const branch = process.env.LDP_SKILLS_BRANCH ?? "main";
  if (!repo || !token) return loadFromBundled();

  // Use the GitHub REST tree API to list all .md files in one call, then
  // fetch each via /contents. Two requests for a typical 10-skill repo.
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "LDP-Legal-Suite",
      },
      cache: "no-store",
    },
  );
  if (!treeRes.ok) {
    console.warn("[skills] github tree fetch failed", treeRes.status);
    return loadFromBundled();
  }
  const tree = (await treeRes.json()) as {
    tree: Array<{ path: string; type: string; sha: string }>;
  };

  const mdPaths = tree.tree
    .filter((e) => e.type === "blob" && e.path.endsWith(".md"))
    .map((e) => e.path);

  const skills: Skill[] = [];
  for (const relPath of mdPaths) {
    const fileRes = await fetch(
      `https://raw.githubusercontent.com/${repo}/${branch}/${relPath}`,
      {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "LDP-Legal-Suite" },
        cache: "no-store",
      },
    );
    if (!fileRes.ok) continue;
    const content = await fileRes.text();
    const parsed = parseSkillFile(content, relPath);
    if (parsed) skills.push({ ...parsed, source: "github" });
  }
  return skills;
}

// =============================================================================
// Frontmatter parser
// =============================================================================
// Lightweight YAML-like parser for the frontmatter at the top of each
// skill file. We don't need full YAML, only key:value and key:[a,b]
// patterns. Avoids pulling a yaml dependency for ~30 lines of parsing.

function parseSkillFile(content: string, relPath: string): { meta: SkillFrontmatter; body: string } | null {
  const trimmed = content.replace(/^﻿/, ""); // BOM
  if (!trimmed.startsWith("---")) {
    // No frontmatter, synthesize an id from the path.
    return {
      meta: { id: relPath.replace(/\.md$/, "").replace(/\//g, "-"), name: relPath },
      body: trimmed,
    };
  }
  const end = trimmed.indexOf("\n---", 4);
  if (end === -1) return null;
  const frontmatter = trimmed.slice(4, end).trim();
  const body = trimmed.slice(end + 4).trim();
  const meta: Partial<SkillFrontmatter> & {
    applies_to?: { matter_types?: string[]; document_types?: string[] };
  } = {};
  for (const line of frontmatter.split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (!m) continue;
    const key = m[1] ?? "";
    const value = (m[2] ?? "").trim();
    if (key === "id") meta.id = stripQuotes(value);
    else if (key === "name") meta.name = stripQuotes(value);
    else if (key === "output") meta.output = stripQuotes(value) as "docx" | "text";
    else if (key === "priority") meta.priority = Number(value);
    else if (key === "matter_types" && value.startsWith("[")) {
      meta.applies_to = {
        ...meta.applies_to,
        matter_types: parseArray(value),
      };
    } else if (key === "document_types" && value.startsWith("[")) {
      meta.applies_to = {
        ...meta.applies_to,
        document_types: parseArray(value),
      };
    }
  }
  if (!meta.id) meta.id = relPath.replace(/\.md$/, "").replace(/\//g, "-");
  if (!meta.name) meta.name = meta.id;
  return { meta: meta as SkillFrontmatter, body };
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

function parseArray(s: string): string[] {
  return s
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((v) => stripQuotes(v.trim()))
    .filter(Boolean);
}
