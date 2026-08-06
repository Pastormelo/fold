# Fold

A church care platform built on one premise: **a person should not be able to
quietly disappear.**

`HANDOFF.md` in this repo is the specification and the authority. The code cites
it constantly — every `§3`, `§8.2`, `§7's five parts` in a comment is a reference
to a numbered section of that file, and those comments explain *why* the code
refuses things. Read it first. `START-HERE.md` is the shorter orientation that
came with it.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in — see the comments in that file
npm run db:migrate
npm run dev
```

The only variable you cannot do without is `DATABASE_URL`. Everything else
degrades honestly: without Supabase keys the app has no sign-in, without
`ANTHROPIC_API_KEY` the four AI sections on Pathway say so and the rest of the
page works, without Planning Center credentials the integration says so. Nothing
pretends.

```bash
npm test          # 584 tests, no database required
npm run lint
npm run build     # works without a database; the connection is lazy on purpose
```

## How it is arranged, and why

**`src/domain/` is the rules, and it is where to look first.** Sixteen modules,
each pure, each tested, none of them aware of React, Postgres, or a request. The
refusal *wording* lives there too, not just the boolean — because "you may not do
this" is information a person needs, and a rule whose explanation lives somewhere
else drifts from it. If you are wondering whether Fold permits something, the
answer is in here and it has a test next to it.

**`src/data/` reads.** Every function resolves the viewer itself rather than
taking one as an argument, and every query is scoped by that viewer's church. A
function that accepted a `churchId` parameter would be one call site away from
being handed the wrong one.

**`src/app/**/actions.ts` writes.** A Server Action is a POST endpoint anyone can
reach, so every one of them re-resolves the viewer and re-checks the permission on
the server. Gating what the page *renders* is a courtesy to the reader, never a
control.

**`src/app/(signed-in)/`** is a route group — parentheses, so it changes no URL.
It exists so the rail and top bar can live in a layout rather than being rendered
by each page. When they were per-page, every click re-queried the navigation
before anything could appear, and there was nowhere to put a loading boundary
that would not also blank the rail.

## What is built

| Area | State |
| --- | --- |
| Confidentiality tiers (§3) | Built, tested, enforced in the DAL and in Postgres |
| Roles, permissions, individual grants (§5) | Built; every exception is listed with who granted it and why |
| Pathway lifecycle, diff, publish gate (§4) | Built; state is never set from a form value |
| Care journeys (§11 step 5) | Built; progress is derived, never stored |
| People, folds, households, guests (§2) | Built |
| Restoration cases | Built; two named elders, sealed rather than deleted |
| Notes over the tier model | Built; redaction is per viewer |
| Prayer, milestones, tasks, reports | Built |
| Planning Center import (§6) | Built — OAuth sign-in, dry-run preview, no auto-merge |
| AI Pathway builder (§7) | Built — discovery, blueprint, health check, review |
| Mobile layout | Built at 375px; the rail becomes a bottom tab bar |
| Search | **Not built.** The top bar shows a disabled box saying so |
| Households creation | **Not built.** Households exist; nothing creates one |
| `Fold App.dc.html` as a separate product | **Not built**, and not a task — it is a different application, not a responsive version of this one |

## Things a new reader will trip over

**Migrations are in two piles.** `drizzle/meta/_journal.json` lists what
`npm run db:migrate` applies. Five files are *not* in it and were applied by hand
through the Supabase SQL editor, because they need a role the app connection does
not have: `0006_enable_rls`, `0007_app_role_and_policies`,
`0007a_let_fold_app_migrate`, `0012_discovery_rls`, and
`0012a_hand_over_table_ownership`. Each says at the top why it is hand-applied.

**`0012a_hand_over_table_ownership.sql` has been run, and the trap it fixed is
worth knowing anyway.** 22 of 32 tables were owned by `postgres` rather than by the
app role, because migrations 0000–0007 were pasted into the SQL editor. `ALTER
TABLE` needs ownership, not privileges, so a migration touching any of those 22
failed with `42501` — and drizzle-kit swallows that error, printing nothing and
exiting 1. **A migration appears to run and silently does not.** If that ever
happens again, either run the offending file as `postgres` or set
`MIGRATION_DATABASE_URL` to a connection string for a role that owns the tables.

**Which pooler the `DATABASE_URL` points at changes how fast the whole app is.**
`src/db/client.ts` turns prepared statements on unless the port is 6543. That is
not a micro-optimisation: without a prepared statement postgres.js cannot pipeline,
so each parameterised query needs its own round trip before its parameters can be
sent, and a page's queries run one after another even inside a `Promise.all`.
Measured against this project's database, one round trip being 105ms — a single
query 213ms versus 108ms, and six queries on one page **1535ms versus 118ms**. The
pool size matters for the same reason: `max: 1` pipelines, `max: 10` spreads six
queries over ten connections and takes twice as long. Both directions were measured
rather than assumed, and turning prepared statements on against the transaction
pooler was tested too — it hangs until `57014 canceling statement due to statement
timeout`, which is why the flag is derived from the port and not simply enabled.

**Row-level security is on every table, with one `fold_app` policy each.** It is a
second lock: confidentiality in Fold is enforced by the tier model, the permission
checks, and every query being scoped by `church_id`. RLS matters because `anon`
and `authenticated` have no policy at all, so Supabase's REST API returns nothing
to the publishable key. A new table does not get this automatically — the loop in
`0012_discovery_rls.sql` has to be re-run. It has been missed twice.

**The Planning Center response shape is unverified.** `src/planning-center/client.ts`
was written without access to a live account, so its Zod schemas are an assumption
about the People API, not a confirmation. They are strict and a mismatch names the
field that was wrong, and `client.test.ts` pins the assumed shape — so when the
first real response disagrees, the schema and the fixtures change together. The
first successful preview is the verification.

**`export const dynamic = 'force-dynamic'` in the root layout is load-bearing.**
Every screen renders content redacted for one specific viewer, so a shared
prerender or a cache entry keyed on less than the viewer's identity is a
confidentiality bug, not a performance choice.

## The invariants worth knowing before changing anything

§8 of `HANDOFF.md` lists eight. These are the four that have actually caught bugs
in this codebase:

- **§8.2 — a claim must match what it was computed from.** Counts in a sentence
  are `.length` on the array they describe, not a separate number.
- **§8.3 — the gate and the explanation come from one evaluation.** A disabled
  control and the reason beside it are the same call, or they disagree.
- **§8.5 — an action reporting success must have done something.** Several actions
  refuse a no-op rather than reporting a cheerful nothing.
- **§8.8 — a deliberate absence is not an oversight.** `unmapped` and `fold_only`
  are different states; a field marked intentionally empty stops being flagged.

## Where the AI is allowed to act, and where it is not

`src/domain/ai.ts` holds `AI_MUST_NOT` — eight things with eight distinct reasons.
The prompt sent to the model is *generated* from that list, so the boundary the
code enforces and the boundary the model is told cannot drift apart. The model
proposes; a person decides. There is no code path from a model to the active
pathway, and `blocksPublishing` is derived from severity by the domain rather than
being a field the model fills in.
