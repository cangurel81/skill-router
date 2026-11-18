# skill-router

[![test](https://github.com/cangurel81/skill-router/actions/workflows/test.yml/badge.svg)](https://github.com/cangurel81/skill-router/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/@cangurel81/skill-router.svg)](https://www.npmjs.com/package/@cangurel81/skill-router)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

Index, classify and search a large agent-skill catalogue — so the agent stops guessing which of
your 900 skills applies, and so you notice when most of the catalogue is duplicated.

Zero dependencies. Node 18+. One file. No config required.

```bash
npx @cangurel81/skill-router --search expo
```

---

## The problem it solves

Once a machine has more than a few dozen installed skills, two failures appear and neither one is
visible:

**1. The agent guesses.** It names a skill that does not exist, or writes from scratch something
already installed forty times over, because it cannot tell which of a thousand descriptions
matches the task.

**2. The catalogue silently fills with copies.** A repository ships `skills/` plus
`docs/ja-JP/skills`, `docs/zh-CN/skills` and a mirrored `pi/core/skills` tree. Every one is
discovered as a separate capability. Your inventory says 966 skills; 651 of them are the same 315
translated or mirrored. Every search returns duplicates, and the counts you reason from are wrong.

`skill-router` measures both and answers the routing question with paths, not vibes.

## What it does

| Step | Detail |
|---|---|
| Finds roots | `--root` flags, `SKILL_ROOTS`, or well-known install locations |
| Walks | up to 5 levels deep, skips `node_modules`, `.git`, `dist`, `build`, `vendor` |
| Parses | `SKILL.md` YAML frontmatter without a YAML dependency (block scalars included) |
| Classifies | 13 domain groups by weighted keyword match on name + description |
| De-duplicates | two detectors: `docs/<locale>/` trees, and byte-identical files via SHA-1 |
| Reports | inventory, per-domain counts, duplicate names, unusable descriptions |
| Searches | ranked matches, word-boundary aware, with full file paths |

It never edits, deletes or installs anything. It reads and reports.

## Install

Pick one. They all run the same three files.

**npm — recommended**

```bash
npx @cangurel81/skill-router --root ~/.claude/skills --search testing   # no install
npm i -g @cangurel81/skill-router                                       # global command
```

The package installs the command `skill-router`, so after a global install you can drop the
`npx @cangurel81/` prefix:

```bash
skill-router --search expo
```

**Clone and run directly**

```bash
git clone https://github.com/cangurel81/skill-router.git
cd skill-router
node bin/skill-router.mjs
```

**Use as an agent skill**

Register the repo's `skills/` folder as a skill root, in whichever harness you use:

```jsonc
// opencode.jsonc
{ "skills": ["~/code/skill-router/skills"] }
```

```bash
# Claude Code
ln -s ~/code/skill-router/skills/skill-router ~/.claude/skills/skill-router
```

The skill file at `skills/skill-router/SKILL.md` teaches the agent the routing procedure: name the
domain, search two or three words, read the path, then open only the winner.

**Copy the script**

```bash
curl -O https://raw.githubusercontent.com/cangurel81/skill-router/main/bin/skill-router.mjs
node skill-router.mjs --root ~/.claude/skills --search testing
```

**Release archive**

Every tag attaches the same three files as a zip — see
[releases](https://github.com/cangurel81/skill-router/releases/latest).

## Usage

```bash
node bin/skill-router.mjs                       # inventory of every root
node bin/skill-router.mjs --search expo         # ranked matches
node bin/skill-router.mjs --search video --group video
node bin/skill-router.mjs --groups              # domain keys and counts
node bin/skill-router.mjs --dupes               # same name, different folders
node bin/skill-router.mjs --weak                # descriptions too short to route on
node bin/skill-router.mjs --json                # machine-readable, all records
node bin/skill-router.mjs --write ./index       # write index/skills.json
node bin/skill-router.mjs --help
```

Exit codes: `0` success, `1` no skill root found.

### Choosing roots

```bash
node bin/skill-router.mjs --root ./skills --root ~/.claude/skills
SKILL_ROOTS=~/.claude/skills:./skills node bin/skill-router.mjs   # ';' on Windows
```

`--root` wins over `SKILL_ROOTS`, which wins over the defaults:

```
./.agents/skills        ./.opencode/skill       ./.claude/skills      ./skills
~/.claude/skills        ~/.codex/skills         ~/.kimi-code/skills
~/.config/opencode/skills        ~/.config/opencode/local-skills
```

## Real output

Run against a real repository that registers its root instead of its `skills/` folder:

```console
$ node bin/skill-router.mjs --root ~/.config/opencode/vendor/affaan-m__ecc

SKILL CATALOGUE
================================================================
Roots with skills : 1
  /home/me/.config/opencode/vendor/affaan-m__ecc
    966 files, 315 genuine

Total SKILL.md files      : 966
  genuine                 : 315
  copies                  : 651 (67%)  [locale 518, identical 133]
  unique names (genuine)  : 315
  duplicate names         : 0
  weak descriptions       : 0

By group (genuine only):
  Agent / LLM / orchestration             105
  Other                                    45
  Code quality / testing / process         30
  Backend / API / databases                28
  Mobile / Expo / React Native             20
  Frontend / UI / design systems           18
  Infra / DevOps / network                 16
  Marketing / content / social             12
  Video / motion / audio                   12
  Data / research / analytics              10
  Security / compliance                     9
  Desktop / documents / office              7
  SEO / GEO / search                        3
```

The honest reading: 315 real capabilities, 651 files that only exist because the same skills were
translated into six languages and mirrored once. Register `.../ECC-main/skills` instead of
`.../ECC-main` and 966 becomes 315.

Searching is where it earns its place:

```console
$ node bin/skill-router.mjs --search caption

"caption" -> 1 match(es)

* remotion-video-creation  [Video / motion / audio]
  Best practices for Remotion - Video creation in React. 29 domain-specific rules covering 3D,
  animations, audio, captions, charts, transitions, and more...
  /home/me/.config/opencode/vendor/affaan-m__ecc/ECC-main/skills/remotion-video-creation/SKILL.md
```

The path is not decoration. Two skills can share a name and differ completely; the path is the only
thing that says which repository you are actually loading.

## Reading the report

Every number has an action attached:

| Signal | Means | Do this |
|---|---|---|
| `copies` above 10% | a root points at a repository, not at its `skills/` folder | point it at the real skill folder |
| `duplicate names` high | two repos ship the same skill; the agent may load either | drop one root, or accept the newer repo |
| `weak descriptions` | description under 25 chars, cannot be routed to | extend it, or treat the skill as absent |
| `Other` group large | descriptions too vague to classify | the same skills are also unroutable |
| a domain at `0` | genuine capability gap | this is where a new skill is justified |

`--dupes` prints both paths for every collision, so you can diff them before deciding.
`--weak` prints the character count, so "too short" is a number and not an opinion.

## When a new skill is justified

All three must hold:

1. `--search` over three plausible terms returns nothing relevant.
2. The gap is knowledge no public repository could ship — local toolchain, local traps, private
   systems.
3. The knowledge repeats. It has already cost time twice.

Otherwise extend an existing skill or fix its description. A fourth near-duplicate makes the
catalogue worse, not more capable.

## How duplicate detection works

Two independent detectors, because the two failure modes look different:

**Locale trees.** Any path matching `docs/<lang>/…` where `<lang>` is a locale slug (`tr`, `ja-JP`,
`zh-CN`, `pt_BR`) is a translated copy. This catches translations, which are *not* byte-identical
and would otherwise look like 183 new skills.

**Identical files.** Skills sharing a name whose `SKILL.md` has the same SHA-1 are the same file
copied. This catches mirrored trees (`pi/core/skills`, a vendored second copy) with no naming
convention to key on. The copy inside a real `skills/` directory wins as canonical, then the
shortest path, then lexicographic order — so the reported path never sends you to the mirror, and
the result is stable across runs and platforms.

Nothing is auto-deleted. Deleting skill folders is a decision with consequences; the tool hands you
the list and the path.

## Development

```bash
npm test        # syntax check + smoke test
node test/smoke.mjs
```

The smoke test builds a throwaway catalogue containing one genuine pair, one translated locale
copy and one byte-identical mirror, runs the real CLI, and asserts the counts, the canonical path,
the miss path and the exit codes. CI runs it on Linux, macOS and Windows across Node 18, 20 and 22 —
the script must behave identically on all three, since path separators are the main portability
risk here.

## Limits

- It indexes discoverability, not quality. A short description is a routing failure, not a bad
  skill.
- It reads frontmatter only. It does not open skill bodies — that is a separate review pass.
- Classification is keyword-based and will occasionally land a skill in the wrong group. Search
  covers all groups by default, so this only costs you when you filter with `--group`.
- It does not fetch, install or update skills.

## License

MIT — see [LICENSE](LICENSE).
