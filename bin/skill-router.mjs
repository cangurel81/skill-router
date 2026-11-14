#!/usr/bin/env node
/**
 * skill-router - index, classify and search a large agent-skill catalogue.
 *
 * Once a machine has more than a few dozen skills, two things break:
 * the agent cannot tell which skill applies, and nobody notices when the
 * catalogue is half full of duplicated or translated copies.
 *
 * This tool scans every skill root, reads each SKILL.md frontmatter, groups
 * skills by domain, separates real capabilities from locale/duplicate trees,
 * and answers "which skill fits this job?" with ranked matches and paths.
 *
 * Zero dependencies. Node 18+.
 *
 *   node bin/skill-router.mjs                     summary of every root
 *   node bin/skill-router.mjs --search expo       ranked matches
 *   node bin/skill-router.mjs --search video --group video
 *   node bin/skill-router.mjs --groups            group keys and counts
 *   node bin/skill-router.mjs --dupes             same name, different folders
 *   node bin/skill-router.mjs --weak              unusable descriptions
 *   node bin/skill-router.mjs --json              machine-readable output
 *
 * Roots come from, in order:
 *   1. --root <path>            (repeatable, wins over everything)
 *   2. SKILL_ROOTS env var      (paths separated by the OS path delimiter)
 *   3. well-known locations     (see DEFAULT_ROOTS)
 */

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, resolve, delimiter } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const SKIP_DIRS = new Set(['node_modules', '.git', '.cache', 'cache', 'dist', 'build', 'vendor']);
const MAX_DEPTH = 5;
const WEAK_DESCRIPTION = 25;

const DEFAULT_ROOTS = [
  join(process.cwd(), '.agents', 'skills'),
  join(process.cwd(), '.opencode', 'skill'),
  join(process.cwd(), '.claude', 'skills'),
  join(process.cwd(), 'skills'),
  join(HOME, '.config', 'opencode', 'skills'),
  join(HOME, '.config', 'opencode', 'local-skills'),
  join(HOME, '.config', 'opencode', 'skill'),
  join(HOME, '.claude', 'skills'),
  join(HOME, '.codex', 'skills'),
  join(HOME, '.kimi-code', 'skills'),
];

/* ------------------------------------------------------------------ groups */

const GROUPS = [
  { key: 'seo', label: 'SEO / GEO / search', words: ['seo', 'serp', 'backlink', 'hreflang', 'sitemap', 'schema markup', 'keyword research', 'ai overview', 'citability', 'llms.txt', 'local seo', 'search console', 'core web vitals'] },
  { key: 'video', label: 'Video / motion / audio', words: ['video', 'remotion', 'animation', 'motion graphic', 'ffmpeg', 'caption', 'subtitle', 'lottie', 'audiogram', 'music', 'text-to-speech', 'tts', 'voiceover', 'shorts', 'reels', 'waveform', 'slideshow', 'lower third', 'countdown'] },
  { key: 'wordpress', label: 'WordPress / WooCommerce', words: ['wordpress', 'woocommerce', 'wp-cli', 'elementor', 'gutenberg', 'custom post type', 'plugin header'] },
  { key: 'mobile', label: 'Mobile / Expo / React Native', words: ['expo', 'react native', 'android', 'ios', 'swift', 'kotlin', 'flutter', 'dart', 'app store', 'play store', 'eas build'] },
  { key: 'frontend', label: 'Frontend / UI / design systems', words: ['react', 'next.js', 'vue', 'nuxt', 'svelte', 'angular', 'css', 'tailwind', 'frontend', 'design system', 'accessibility', 'a11y', 'gsap', 'three.js', 'd3.js', 'component library'] },
  { key: 'backend', label: 'Backend / API / databases', words: ['laravel', 'symfony', 'spring boot', 'quarkus', 'mybatis', 'jpa', 'hibernate', 'php', 'django', 'fastapi', 'nestjs', 'express', 'rails', 'api design', 'rest api', 'graphql', 'microservice', 'postgres', 'mysql', 'redis', 'database', 'orm', 'query optimization', 'schema design'] },
  { key: 'marketing', label: 'Marketing / content / social', words: ['marketing', 'content strategy', 'social media', 'linkedin', 'twitter', 'newsletter', 'copywriting', 'brand voice', 'campaign', 'carousel', 'content brief', 'blog post', 'outreach', 'sales'] },
  { key: 'agent', label: 'Agent / LLM / orchestration', words: ['agent', 'llm', 'prompt', 'mcp', 'subagent', 'orchestrat', 'harness', 'eval', 'rag', 'memory', 'autonomous', 'skill', 'claude code', 'context window'] },
  { key: 'security', label: 'Security / compliance', words: ['security', 'vulnerab', 'pentest', 'hipaa', 'gdpr', 'compliance', 'phi', 'secret', 'threat model', 'access control'] },
  { key: 'infra', label: 'Infra / DevOps / network', words: ['docker', 'kubernetes', 'deploy', 'ci/cd', 'github actions', 'nginx', 'network', 'vlan', 'dns', 'vpn', 'homelab', 'wireguard', 'cloud'] },
  { key: 'data', label: 'Data / research / analytics', words: ['data pipeline', 'analytics', 'research', 'scrap', 'crawl', 'etl', 'sql', 'pandas', 'statistic', 'dashboard', 'benchmark'] },
  { key: 'code', label: 'Code quality / testing / process', words: ['test-driven', 'unit test', 'tdd', 'code review', 'debug', 'refactor', 'coding standard', 'typescript', 'python', 'golang', 'rust', 'java', 'lint', 'codebase', 'architecture decision'] },
  { key: 'desktop', label: 'Desktop / documents / office', words: ['windows', 'desktop', 'pywinauto', 'uiautomation', 'screenshot', 'excel', 'pdf', 'pandoc', 'document', 'slides', 'presentation'] },
];

function classify(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const g of GROUPS) {
    let score = 0;
    for (const w of g.words) if (text.includes(w)) score += w.includes(' ') || w.includes('-') ? 3 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best ?? { key: 'other', label: 'Other' };
}

/* ------------------------------------------------------------------- roots */

function rootsFromArgs(argv) {
  const roots = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root' && argv[i + 1]) roots.push(resolve(argv[i + 1]));
  }
  if (roots.length) return roots;

  const env = process.env.SKILL_ROOTS;
  if (env) {
    const fromEnv = env.split(delimiter).map((p) => p.trim()).filter(Boolean).map(resolve);
    if (fromEnv.length) return fromEnv;
  }
  return DEFAULT_ROOTS;
}

function findSkillFiles(root) {
  const found = [];
  const stack = [{ path: root, depth: 0 }];
  while (stack.length) {
    const { path, depth } = stack.pop();
    if (depth > MAX_DEPTH) continue;
    let entries;
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(path, e.name);
      if (!e.isDirectory()) {
        if (e.name === 'SKILL.md') found.push(full);
        continue;
      }
      if (SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      try {
        if (statSync(full).isDirectory()) stack.push({ path: full, depth: depth + 1 });
      } catch {
        /* unreadable */
      }
    }
  }
  return found;
}

/* -------------------------------------------------------------- frontmatter */

function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return {};
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) return {};

  const fields = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    const value = raw.trim();
    if (['', '|', '>', '|-', '>-', '|+', '>+'].includes(value)) {
      const cont = [];
      while (i + 1 < end && /^\s+\S/.test(lines[i + 1])) cont.push(lines[++i].trim());
      fields[key] = cont.join(' ').trim();
    } else {
      fields[key] = value.replace(/^["']|["']$/g, '').trim();
    }
  }
  return fields;
}

/* --------------------------------------------------------------- copy trees */

/**
 * Translated documentation trees are the most common source of phantom
 * skills: a repo ships docs/<locale>/skills alongside the real ones and every
 * locale is discovered as a separate capability. They add no reach.
 */
const LOCALE_SEGMENT = /^[a-z]{2}(?:[-_][A-Za-z]{2,4})?$/;

function isLocaleCopy(path) {
  const parts = path.split(/[\\/]/);
  for (let i = 0; i < parts.length - 1; i++) {
    if ((parts[i] === 'docs' || parts[i] === 'doc') && LOCALE_SEGMENT.test(parts[i + 1])) return true;
  }
  return false;
}

/* -------------------------------------------------------------------- scan */

function scan(roots) {
  const records = [];
  const seen = new Set();

  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const file of findSkillFiles(root)) {
      if (seen.has(file)) continue;
      seen.add(file);
      let fm = {};
      let text = '';
      try {
        text = readFileSync(file, 'utf8');
        fm = parseFrontmatter(text);
      } catch {
        /* unreadable */
      }
      const name = fm.name || basename(dirname(file));
      const description = (fm.description || '').replace(/\s+/g, ' ').trim();
      const group = classify(name, description);
      const localeCopy = isLocaleCopy(file);
      records.push({
        name,
        description,
        group: group.key,
        groupLabel: group.label,
        path: file,
        root,
        copy: localeCopy,
        origin: localeCopy ? 'locale' : null,
        hash: createHash('sha1').update(text).digest('hex'),
        disabled: String(fm['disable-model-invocation'] ?? '').toLowerCase() === 'true',
        weak: description.length < WEAK_DESCRIPTION,
      });
    }
  }

  // Second detector: byte-identical files. Repos often ship a mirrored tree
  // (a second copy of skills/ under another folder) that is not a locale copy
  // and therefore escapes the path rule.
  //
  // Canonical selection matters: a file under a real `skills/` directory always
  // beats a mirror, otherwise a folder named "mirror" can win on path length and
  // the reported path sends the reader to the copy.
  const canonicalScore = (r) => [/[\\/]skills[\\/]/i.test(r.path) ? 0 : 1, r.path.length];
  const canonical = (a, b) => {
    const [ax, ay] = canonicalScore(a);
    const [bx, by] = canonicalScore(b);
    return ax - bx || ay - by || a.path.localeCompare(b.path);
  };

  const byContent = new Map();
  for (const r of records) {
    if (r.copy) continue;
    const key = `${r.name.toLowerCase()}|${r.hash}`;
    const list = byContent.get(key) ?? [];
    list.push(r);
    byContent.set(key, list);
  }
  for (const list of byContent.values()) {
    if (list.length < 2) continue;
    list.sort(canonical);
    for (const r of list.slice(1)) {
      r.copy = true;
      r.origin = 'duplicate';
    }
  }

  for (const r of records) delete r.hash;
  records.sort((a, b) => a.name.localeCompare(b.name));
  return records;
}

/* ----------------------------------------------------------------- reports */

function stat(records) {
  const genuine = records.filter((r) => !r.copy);
  const copies = records.length - genuine.length;
  const byGroup = new Map();
  for (const r of genuine) byGroup.set(r.groupLabel, (byGroup.get(r.groupLabel) || 0) + 1);

  const byName = new Map();
  for (const r of genuine) {
    const list = byName.get(r.name.toLowerCase()) || [];
    list.push(r);
    byName.set(r.name.toLowerCase(), list);
  }
  const dupes = [...byName.values()].filter((l) => l.length > 1);

  return {
    total: records.length,
    genuine: genuine.length,
    copies,
    localeCopies: records.filter((r) => r.origin === 'locale').length,
    duplicateCopies: records.filter((r) => r.origin === 'duplicate').length,
    uniqueNames: new Set(genuine.map((r) => r.name.toLowerCase())).size,
    byGroup,
    dupes,
    weak: genuine.filter((r) => r.weak),
    disabled: genuine.filter((r) => r.disabled).length,
    roots: [...new Set(records.map((r) => r.root))],
  };
}

function summary(records) {
  const s = stat(records);
  const out = [];
  out.push('SKILL CATALOGUE');
  out.push('='.repeat(64));
  out.push(`Roots with skills : ${s.roots.length}`);
  for (const root of s.roots) {
    const all = records.filter((r) => r.root === root).length;
    const real = records.filter((r) => r.root === root && !r.copy).length;
    out.push(`  ${root}`);
    out.push(`    ${all} files, ${real} genuine`);
  }
  out.push('');
  out.push(`Total SKILL.md files      : ${s.total}`);
  out.push(`  genuine                 : ${s.genuine}`);
  out.push(
    `  copies                  : ${s.copies}${s.total ? ` (${Math.round((s.copies / s.total) * 100)}%)` : ''}` +
      `  [locale ${s.localeCopies}, identical ${s.duplicateCopies}]`,
  );
  out.push(`  unique names (genuine)  : ${s.uniqueNames}`);
  out.push(`  duplicate names         : ${s.dupes.length}`);
  out.push(`  weak descriptions       : ${s.weak.length}`);
  out.push('');
  out.push('By group (genuine only):');
  for (const [label, n] of [...s.byGroup.entries()].sort((a, b) => b[1] - a[1])) {
    out.push(`  ${label.padEnd(38)} ${String(n).padStart(4)}`);
  }
  return out.join('\n');
}

function search(records, query, groupFilter) {
  const q = query.toLowerCase().trim();
  if (!q) return 'Error: --search needs a query.';
  const pool = records.filter(
    (r) => !r.copy && (!groupFilter || r.group === groupFilter || r.groupLabel.toLowerCase().includes(groupFilter)),
  );

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Plural tolerance so "captions" still finds "caption".
  const forms = new Set([q, q.endsWith('s') ? q.slice(0, -1) : `${q}s`]);
  const alts = [...forms].map(escape).join('|');
  // A match must sit on real word boundaries: "expo" must not match "exposed".
  const wordRe = new RegExp(`(^|[^a-z0-9])(${alts})(?![a-z0-9])`);

  const scored = pool
    .map((r) => {
      const name = r.name.toLowerCase();
      const segments = name.split(/[^a-z0-9+#.]+/).filter(Boolean);
      let score = 0;
      if (name === q) score += 100;
      if (segments.some((s) => forms.has(s))) score += 60;
      else if (name.includes(q)) score += 15; // weak: tie-breaker only
      if (wordRe.test(name)) score += 20;
      if (wordRe.test(r.description.toLowerCase())) score += 25;
      return { r, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.r.name.localeCompare(b.r.name));

  if (!scored.length) return `No skill matches "${query}".`;
  const out = [`"${query}" -> ${scored.length} match(es)`, ''];
  for (const { r } of scored.slice(0, 25)) {
    out.push(`* ${r.name}  [${r.groupLabel}]`);
    if (r.description) out.push(`  ${r.description.slice(0, 220)}${r.description.length > 220 ? '...' : ''}`);
    out.push(`  ${r.path}`);
  }
  return out.join('\n');
}

function groupList(records) {
  const s = stat(records);
  const rows = [...s.byGroup.entries()].sort((a, b) => b[1] - a[1]);
  const out = rows.map(([label, n]) => {
    const key = GROUPS.find((g) => g.label === label)?.key ?? 'other';
    return `${key.padEnd(12)} ${label.padEnd(38)} ${n}`;
  });
  if (rows.length) out.unshift('key          label                                  count');
  return out.join('\n');
}

function dupes(records) {
  const s = stat(records);
  if (!s.dupes.length) return 'No duplicate names.';
  const out = [`${s.dupes.length} duplicate name(s):`];
  for (const list of s.dupes) {
    out.push('');
    out.push(`${list[0].name} (${list.length})`);
    for (const r of list) out.push(`  ${r.path}`);
  }
  return out.join('\n');
}

function weak(records) {
  const s = stat(records);
  if (!s.weak.length) return 'No weak descriptions.';
  return s.weak.map((r) => `${r.name}  (${r.description.length} chars)  ${r.path}`).join('\n');
}

/* --------------------------------------------------------------------- cli */

const argv = process.argv.slice(2);
const valueOf = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
  process.exit(0);
}

const roots = rootsFromArgs(argv);
const records = scan(roots);

if (!roots.some((r) => existsSync(r))) {
  console.error('No skill root found. Pass --root <path> or set SKILL_ROOTS.');
  process.exit(1);
}

if (argv.includes('--json')) {
  console.log(JSON.stringify(records, null, 2));
} else if (argv.includes('--search') || argv.includes('--grep')) {
  console.log(search(records, valueOf('--search') ?? valueOf('--grep') ?? '', valueOf('--group')));
} else if (argv.includes('--groups')) {
  console.log(groupList(records));
} else if (argv.includes('--dupes')) {
  console.log(dupes(records));
} else if (argv.includes('--weak')) {
  console.log(weak(records));
} else {
  console.log(summary(records));
  const outDir = valueOf('--write');
  if (outDir) {
    try {
      mkdirSync(resolve(outDir), { recursive: true });
      writeFileSync(join(resolve(outDir), 'skills.json'), JSON.stringify(records, null, 2), 'utf8');
      console.log(`\nWrote ${join(resolve(outDir), 'skills.json')}`);
    } catch (e) {
      console.error(`Could not write index: ${e.message}`);
    }
  }
}
