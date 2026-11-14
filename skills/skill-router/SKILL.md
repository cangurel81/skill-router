---
name: skill-router
description: Use when a task may already be covered by one of the hundreds of installed agent skills and you need the right one instead of guessing — "which skill for this", "do we already have a skill for X", "is there a skill that does Y", "my skill folder is a mess", "too many skills", or when two installed skills overlap and one must be picked. Scans every configured skill root, classifies skills by domain, separates genuine skills from translated locale copies, and returns ranked matches with file paths plus a measured bloat report. Do not use for authoring a new skill (use writing-skills) or for installing a repository of skills.
version: 1.0.0
---

# Skill Router

A large skill catalogue fails in two directions. The agent picks a skill that does not exist,
or it writes from scratch something already installed forty times over. Both come from guessing
instead of looking.

**Rule: never claim "no skill covers this" and never name a skill without running the router.**

## Run it

From the repository that contains this skill:

```bash
node bin/skill-router.mjs                      # full catalogue inventory
node bin/skill-router.mjs --search expo        # ranked matches with paths
node bin/skill-router.mjs --search video --group video
node bin/skill-router.mjs --groups             # domain keys and counts
node bin/skill-router.mjs --dupes              # same name, different folders
node bin/skill-router.mjs --weak               # descriptions too short to route on
node bin/skill-router.mjs --json               # machine-readable
```

Point it somewhere explicit:

```bash
node bin/skill-router.mjs --root ~/.claude/skills --search testing
node bin/skill-router.mjs --root ./vendor/skills --root ./skills
SKILL_ROOTS=~/.claude/skills:./skills node bin/skill-router.mjs
```

`--root` (repeatable) beats `SKILL_ROOTS`, which beats the built-in defaults
(`./.claude/skills`, `./.agents/skills`, `./skills`, `~/.claude/skills`, `~/.config/opencode/skills`,
`~/.codex/skills`, `~/.kimi-code/skills`).

Read the **path** in every result before trusting the name. Two skills can share a name and differ
completely; the path is the only thing that says which repo you are actually loading.

## Routing procedure

1. **Name the domain first.** `--groups` gives the keys. Searching inside a domain beats searching
   the whole catalogue, because generic words like "review", "audit" or "data" match hundreds.
2. **Search two or three different words**, not one. A skill whose name says `tts` may only
   mention "voiceover" in its description; the ranker searches both.
3. **Read the description, then the path.** Description tells you if it fits. Path tells you which
   repo and whether it is a locale copy.
4. **Only then open the SKILL.md.** Opening every candidate is what the index exists to avoid.
5. **If two match and overlap**, pick one, and check `--dupes` to see whether your catalogue carries
   both permanently.

## Domain keys

| Key | Domain | Example search terms |
|---|---|---|
| `seo` | SEO / GEO / search | `geo`, `citability`, `backlink`, `schema`, `llms.txt` |
| `video` | Video / motion / audio | `remotion`, `ffmpeg`, `caption`, `tts`, `shorts` |
| `frontend` | Frontend / UI / design system | `react`, `vue`, `tailwind`, `gsap`, `a11y` |
| `backend` | Backend / API / databases | `laravel`, `fastapi`, `postgres`, `graphql` |
| `mobile` | Mobile / native app work | `expo`, `flutter`, `swift`, `app store` |
| `marketing` | Marketing / content / social | `linkedin`, `carousel`, `hook`, `campaign` |
| `agent` | Agent / LLM / orchestration | `harness`, `subagent`, `eval`, `memory` |
| `security` | Security / compliance | `audit`, `hardening`, `threat model` |
| `infra` | Infra / DevOps / network | `docker`, `ci/cd`, `dns`, `vpn` |
| `data` | Data / research / analytics | `scrape`, `sql`, `dashboard`, `benchmark` |
| `code` | Code quality / testing | `tdd`, `review`, `refactor`, `lint` |
| `desktop` | Desktop / documents | `pdf`, `pandoc`, `screenshot` |
| `wordpress` | WordPress / WooCommerce | `plugin`, `woocommerce`, `wp-cli` |
| `other` | Unclassified | fix the description |

`other` being large is a finding, not a category. Skills land there because their description is
too vague to classify, which also means no agent can route to them.

## Reading the inventory

The summary reports five numbers. Each one has an action attached:

| Number | Means | Action |
|---|---|---|
| `locale doc copies` above ~10% | repos are registered at their root, so `docs/<locale>/skills` are scanned as skills | register the real `skills/` folder instead |
| `duplicate names` high | two repos ship the same skill; the agent may load either | pick one and drop the other root, or accept the newer repo |
| `weak descriptions` | description under 25 chars, unusable for routing | extend the description or treat the skill as absent |
| `genuine` far below `total` | most of the catalogue is copies | fix roots before adding anything |
| one domain with 0 | real capability gap | this is where a new skill is justified |

The tool never deletes anything and never edits a skill. It measures and reports.

## When a new skill is actually justified

All three must hold:

1. `--search` over three plausible terms returns nothing relevant.
2. The gap is knowledge no public repository could ship — local toolchain, local traps, local
   decisions, private systems.
3. The knowledge repeats. It has already cost time twice.

Otherwise extend an existing skill or fix its description. A fourth near-duplicate skill makes the
catalogue worse, not more capable.

## What this does not do

- It does not install, fetch or update skills.
- It does not validate that a `SKILL.md` is correct — only that it is discoverable.
- It does not judge quality. A short description is a routing failure, not necessarily a bad skill.
- It does not read the skill body. Content review is a separate pass.
