#!/usr/bin/env node
/**
 * Smoke test for skill-router. Builds a temporary catalogue with every case the
 * tool claims to handle, runs the real CLI, and asserts the numbers.
 *
 *   node test/smoke.mjs
 *
 * No test framework, no dependencies - it must stay runnable on a bare Node.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BIN = join(ROOT, 'bin', 'skill-router.mjs');

let failures = 0;
const ok = (label) => console.log(`  ok    ${label}`);
const bad = (label, detail) => {
  failures++;
  console.log(`  FAIL  ${label}`);
  if (detail) console.log(`        ${detail}`);
};

function writeSkill(dir, name, description) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, 'utf8');
}

function run(args) {
  return execFileSync(process.execPath, [BIN, ...args], { encoding: 'utf8' });
}

const fixture = mkdtempSync(join(tmpdir(), 'skill-router-test-'));

try {
  const alphaBody = 'Renders video captions with word-level timing for short-form clips.';
  const betaBody = 'Audits database indexes and suggests query rewrites for slow reads.';

  // Two genuine skills.
  writeSkill(join(fixture, 'skills', 'caption-render'), 'caption-render', alphaBody);
  writeSkill(join(fixture, 'skills', 'query-tuning'), 'query-tuning', betaBody);

  // A translated documentation tree: different content, duplicate capability.
  writeSkill(join(fixture, 'docs', 'ja-JP', 'skills', 'caption-render'), 'caption-render', '動画キャプションを描画します。');

  // A mirrored tree: byte-identical file, no locale segment to key on.
  writeSkill(join(fixture, 'mirror', 'caption-render'), 'caption-render', alphaBody);

  console.log('fixture:', fixture);
  console.log('\nsummary');

  const summary = run(['--root', fixture]);
  const expect = [
    ['Total SKILL.md files      : 4', 'counts every file on disk'],
    ['genuine                 : 2', 'only two distinct capabilities'],
    ['locale 1', 'detects the docs/ja-JP tree'],
    ['identical 1', 'detects the mirrored byte-identical file'],
  ];
  for (const [needle, label] of expect) {
    if (summary.includes(needle)) ok(label);
    else bad(label, `expected "${needle}"`);
  }

  console.log('\nsearch');

  const found = run(['--root', fixture, '--search', 'caption']);
  if (found.includes('"caption" -> 1 match')) ok('search returns one genuine match, not the copies');
  else bad('search returns one genuine match, not the copies', found.split('\n')[0]);

  if (found.includes(join(fixture, 'skills', 'caption-render', 'SKILL.md'))) ok('the canonical path is the short one');
  else bad('the canonical path is the short one');

  const missing = run(['--root', fixture, '--search', 'quantum']);
  if (missing.includes('No skill matches')) ok('misses are reported, not invented');
  else bad('misses are reported, not invented');

  console.log('\ngroups');

  const groups = run(['--root', fixture, '--groups']);
  if (groups.includes('video') && groups.includes('backend')) ok('both skills classified into domains');
  else bad('both skills classified into domains', groups);

  console.log('\nexit codes');

  try {
    execFileSync(process.execPath, [BIN, '--root', join(fixture, 'does-not-exist')], { encoding: 'utf8' });
    bad('missing root exits 1');
  } catch (e) {
    if (e.status === 1) ok('missing root exits 1');
    else bad('missing root exits 1', `got status ${e.status}`);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log(failures === 0 ? '\nPASS - all checks green' : `\nFAIL - ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
