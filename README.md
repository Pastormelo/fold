# Fold

A church care platform built on one premise: **a person should not be able to
quietly disappear.**

This is the real build, started from the design handoff in
`~/Downloads/fold-pastor-care/`. `HANDOFF.md` there is the authority; this
codebase implements it. The prototype's code was not ported — its rules and its
copy were.

## What is built

Steps 1 and 2 of the handoff's suggested build order (§11), which it warns are
the two that are painful to retrofit.

| Area | Status |
| --- | --- |
| Confidentiality tier model (§3) | Built and tested |
| Roles and permissions (§5) | Built, `pathway.publish` separate from `pathway.edit` |
| Individual grants over role defaults | Built, audited, with a review list |
| Pathway lifecycle state machine (§4) | Rules built and tested; persistence pending a database |
| Draft diff and publish gate (§4, §8.6–8.8) | Built, with field coverage enforced by the compiler |
| Care journeys (§11 step 5) | Built and tested; schema + migration generated |
| Planning Center constraints (§11 step 6) | Built and tested; no API client yet |
| AI guardrails and schemas (§11 step 7) | Built and tested; no model calls yet |
| People, households, folds, leaders (§2) | Schema + migration generated |
| Restoration cases, care notes, change log | Schema + access rules |
| One screen exercising the tier model | Built, checked per viewer |
| Identity-change transport (sign-out safety) | Built and tested |
| Pathways, journeys, Planning Center, AI | Not started (§11 steps 3–9) |
| Authentication (Supabase Auth) | Built: password, Google, magic link, reset |

## Getting started

```bash
npm install
npm test
npm run dev
```

The app runs without a database. Reads go through sample data in
`src/data/sample.ts`; the confidentiality rules that redact it are the real
ones, in `src/domain/`.

To attach Postgres — any Postgres, a Supabase project or a local install:

```bash
cp .env.example .env.local   # then set DATABASE_URL
npm run db:migrate
```

## Architecture

Three layers, and the boundaries are the security model.

```
src/domain/     Pure functions. The rules. No I/O, no database, tested.
src/data/       Data Access Layer. server-only. Resolves the viewer itself,
                returns DTOs that have already been redacted.
src/app/        Screens. Render what the DAL gave them. No authorization logic.
```

This follows the Data Access Layer pattern from the Next.js data-security
guide. Two consequences worth stating plainly:

**Redacted content is not sent to the browser.** It is not hidden with CSS or
filtered on the client. Checked on the one screen that exists, by requesting it as
three viewers and diffing the payloads:

| Viewer | Care-note bodies in payload | Restoration content |
| --- | --- | --- |
| Avery (administrator) | none | none |
| Ben (group leader) | the 2 `all_leaders` notes only | none |
| Tomás (elder) | all 4 | only the case he carries |

**No route may be prerendered or cached.** `export const dynamic =
'force-dynamic'` sits on the root layout. A page built for one clearance level
must never be served to another, so this is an app-wide invariant rather than a
per-page decision.

## The two rules everything else hangs off

### Tiers are an ordered scale, not booleans

`all_leaders < staff_and_elders < elders_only`. The ordering lives once, in
`TIER_ORDER` (`src/domain/tiers.ts`), and every comparison derives from it. The
handoff records that an early prototype gated only the top tier and leaked the
middle one; `tiers.test.ts` asserts the full 3×3 matrix so that cannot recur.

A viewer's clearance is **derived from their roles**, never stored. `null` means
no pastoral care access, and `null` is returned rather than defaulting to the
lowest tier — a default would silently grant every administrator access to
ordinary care.

### Restoration cases are elder-tier content

Nothing more complicated than that. Every elder reads every case; a reader below
that tier reads none of them, and sees only that a case exists and how it ended.

The handoff's §3 rule 2 proposed a second mechanism — access by per-case
assignment, so that being an elder did not open every case. That is deliberately
**not** implemented. Who carries a case is recorded on the case and shown to
those who can read it, but it is not an access rule. A database check keeps
restoration notes at `elders_only` so they cannot be filed at a tier staff can
reach.

A blocked reader always gets a sentence, never a blank. `CareNoteView` is a
discriminated union, so the withheld variant has no `body` field at all — the
type system keeps content out of it, not reviewer discipline.

## The pathway lifecycle

`src/domain/pathway.ts`, `pathway-diff.ts`, and `pathway-publish.ts` implement §4
as pure functions. Persistence — immutable version snapshots, the change log —
waits on a database, but the rules do not.

**State changes only through actions.** There is no state setter. `attemptTransition`
is the only way to reach a new state, and it refuses with a reason: `not_permitted`,
`illegal_from_state`, `blocked`, or `nothing_to_do`. Refusal messages for permission
come from `permissionCheck` itself, so the sentence a user sees is the one the gate used.

**There is no archive action.** Archiving is a consequence of publishing — the version
that was active becomes archived because a new one displaced it. Offering it as a choice
is what let the prototype claim a live pathway was archived, so `publish` returns the
displaced version in `archives` and nothing else can produce that state.

**Publishing requires a recorded approval.** Confirmed 2026-07-26: a scheduled
version cannot go live unless it was already approved. The `not_approved` blocker
checks the review records rather than the state name, which matters because §4's
attribution rule makes an approval narrower than it looks — a version can sit in
`approved` with nobody having actually approved it, if all that happened was
somebody else resolving an objection.

**Three transitions are marked `inferred`.** §4 lists `discovery` and `scheduled` among
the states but gives no transition reaching either. Rather than quietly invent policy,
those are implemented the obvious way and flagged — the same instinct as the handoff's
`provenance` field.

**Publishing cannot skip its gate.** `attemptTransition` throws if a caller tries to
publish without supplying `publishBlockers`, even empty. An omitted gate that defaulted
to "no blockers" is how a publish slips through.

### Field coverage is a compiler guarantee

§8.7 says the diff must cover every editable field including arrays. That is enforced
by a type, not a checklist — add a field to `EditableStage` without adding it to
`STAGE_FIELDS` and the build fails with `["STAGE_FIELDS is missing", "yourField"]`.
Verified by temporarily adding one. A companion test then mutates each declared field
in turn and asserts the diff notices, so a field cannot be listed but uncompared.

Arrays join on a separator unlikely to appear inside an element (` ¶ `), so
`['a b']` and `['a', 'b']` are not treated as equal. Not airtight — text
containing that separator would still collide — but it survives the ordinary case
a plain `join(' ')` gets wrong.

### Approval attribution

"Objection marked addressed" is **not** "approved". They are independent fields on a
review, and `approvedBy` returns only genuine approvals — a reviewer whose objection
someone else resolved does not appear, however convenient that would be for clearing
the gate. `objectionsAddressedByOthers` records that separately, including whether
the reviewer also approved, stated rather than inferred from absence.

The permanent version record is what someone relies on years later in an
elder-governance dispute. It must not overclaim.

## Care journeys

`src/domain/journeys.ts`. A template for a situation — grief, hospital, a new
believer, benevolence — running on one person a step at a time.

**A journey's last step is its stopping rule.** That is what makes it answer the
product's premise: follow-up ends, and it ends visibly rather than by being
forgotten.

**Windows are an ordered scale**, like tiers: same day → within 48 hours → week 1
→ week 2 → month 1 → month 3 → month 6. `dueDateFor` turns a window plus the
journey's start into a date.

**Nothing about progress is stored.** The handoff describes an instance as
tracking current step, due date, and last contact. All three are computed by
`journeyProgress` from the step completions plus the template, because a stored
due date survives the step it described being finished early. `asOf` is a
parameter rather than a call to `new Date()`, so overdue is testable and two
parts of one request cannot disagree about the time.

**A step ends in a logged outcome or a documented skip**, never silently. The
database holds that rule as a check constraint, so a skip without a reason is
rejected rather than merely discouraged — the same rule §2 puts on a follow-up
touch, and what stops a journey being abandoned a step at a time.

**A journey is visible at its template's tier.** A benevolence journey is
invisible to a group leader for exactly the same reason a benevolence note is.
The person's name stays visible either way: hiding that someone is receiving care
would defeat the point of the product.

**System defaults can be edited, never deleted** (§2). The refusal says why in
terms of the situation: grief does not stop happening because the journey was
deleted. Enforced in the domain rather than the schema, since a check constraint
cannot refuse a DELETE — a trigger could, and would be worth adding if templates
ever get a delete path that bypasses the domain.

## Planning Center

`src/domain/planning-center.ts`. **Planning Center is the system of record for
people and ministry data; Fold is the system of work for pathways and care.**

§11 says to build the mapping constraints first, so this is all constraint and no
API client — what a sync client may attempt has to be settled before anything
attempts it.

**Fold never creates anything in Planning Center.** Not a field, list, category,
or *status value*. There is no function here that produces an `ExternalField`,
only functions that filter the ones already there — the constraint expressed as
code rather than as a comment. When nothing fits, the two honest options are
keeping the milestone in Fold or creating it in Planning Center first, and the
second is guidance rather than a button.

The value half matters as much as the field half. §6's example: if the membership
status has no "Pending elder review" option, Fold cannot invent one. Mapping to a
status field with an unknown value is refused, and the refusal lists what
Planning Center does accept.

**Some content never crosses, and it is not a setting.** `setCategoryEnabled`
*refuses* to enable confidential pastoral notes rather than accepting the change
and ignoring it — a setting that appears to save and does nothing is worse than
one never offered. `isCategoryEnabled` also returns false for it even if a stored
row says otherwise, and a check constraint stops such a row existing.

An escalation is the interesting case: the flag syncs so leaders know care is
happening, the reason does not. `escalationPayload` is one function handling both
halves, so they cannot be handled in two places that drift.

**Near matches are never merged.** Matching tries Planning Center id, then email,
then phone, stopping at the first hit — an ordered list, not a score, so a strong
field beats several weak ones. Two hits produce `possible_duplicates` for a person
to resolve. There is no `merge` function in the module.

Phone comparison uses the last ten digits, so `+1 (555) 000-2222` matches
`555-000-2222`. That is a North American assumption which will occasionally match
two different international numbers sharing a suffix — acceptable only because the
result is a surfaced duplicate rather than a merge.

**Deliberate absence, again.** A mapping is `mapped`, `fold_only` with a reason, or
`unmapped`. The last two are both "not in Planning Center", kept apart because
§8.8 needs a decision to be distinguishable from an oversight;
`undecidedMappings` lists only the oversights.

## AI guardrails

`src/domain/ai.ts`. Schemas and refusals, with no model calls — what the AI may
produce has to be settled before anything produces it.

**Malformed output never reaches configuration.** Every AI-produced shape has a
Zod schema, and the only way to obtain one of these types is a parser returning
`{ ok: false, errors }` rather than throwing. A bad model response cannot become
an exception halfway through a write. There is no cast in the module.

**The fifth part is not optional.** A recommendation carries what it noticed, why
it matters, the consequence, the options, and *which part is the church's judgment
rather than the AI's*. `humanJudgment` is a required non-empty string, so omitting
it fails to parse — and `human_judgment` is `not null` with a blank check in the
schema, because a nullable column would make it optional in the one place that
outlives the code.

**Reasoning cites the church's own answers.** §7's contrast is between "add a
membership interview" and "because your polity requires elder approval…".
`citedAnswerIds` must be non-empty, and `validateRecommendationAgainstSession`
catches a citation naming an answer the church never gave. That second check
matters more than the first: a dangling citation produces a recommendation that
*looks* grounded.

**Refusals are specific.** §7's must-not list is eight entries with eight distinct
reasons, and a test asserts they are distinct — a generic denial teaches a reader
nothing about where the boundary sits. An action nobody has classified is refused
too, since the safe default for something writing to pastoral records is no.

**Rejections stay visible.** `recommendationsWithVerdicts` returns every
recommendation annotated with its verdict; there is no filter that hides rejected
ones, which is why it is shaped as "all of them, annotated" rather than "the open
ones". Every verdict needs a reason, including an acceptance, and "saved for
later" still counts as open.

**An inference is never policy.** A profile entry marked `inferred` must say what
it was inferred from, or it fails to parse — an inference nobody can trace is read
as fact by the next person. `inferenceWarning` counts them for any conclusion that
rests on one.

**Import analysis quotes the document.** `quotedLine` is required, so an
unquotable observation is unrepresentable: a finding a church cannot trace back to
its own words is one they have no way to check.

## Derive, never mirror

§8.1, the failure the prototype hit most often. Concretely:

- The three tier captions count leaders from their roles. The prototype
  hardcoded "61 people / 14 people / 6 people" beside live data; a test asserts
  no count literal can reappear in `TIER_DESCRIPTIONS`.
- The hidden-note caption is generated from the notes actually withheld,
  including its pluralisation ("1 note is" / "2 notes are") and the tier names,
  listed in scale order. A test asserts the stated number equals the number of
  withheld rows.
- A permission's gate and its explanatory sentence come from **one call**,
  `permissionCheck`, which returns `{ allowed, note }` together. The handoff
  records that copy and behavior drifted apart twice in the prototype; there is
  no separate table of permission copy to drift from.

## Authentication

Supabase Auth, with all four ways in: **email and password, Google OAuth, magic
link, and password reset.** `src/auth/`.

### The proxy, not middleware

Session refresh lives in **`src/proxy.ts`**. Next 16 renamed Middleware to Proxy,
and every Supabase guide still says `middleware.ts` — which Next 16 ignores
silently. No error, no warning, just sessions that stop refreshing until people
are logged out mid-visit. The build output naming `ƒ Proxy (Middleware)` is the
confirmation it is wired.

The proxy refreshes tokens and **authorizes nothing**. The Next.js auth guide is
explicit that Proxy runs on every route including prefetches, so security checks
belong "as close as possible to your data source" — which for Fold is the Data
Access Layer, where they already are.

### Two keys, and the difference matters

| Key | Prefix | Who reads it |
| --- | --- | --- |
| Anon | `NEXT_PUBLIC_` | Browser and every request path |
| Service role | **none** | `src/auth/supabase-admin.ts` only, `server-only` |

The anon key is public by design: on its own it grants nothing, because row-level
security plus the session decide what a request may read.

The service-role key **bypasses row-level security completely** — one query with it
reads every restoration case in the database. It has no `NEXT_PUBLIC_` prefix
because Next inlines anything so prefixed into the browser bundle, and
`supabase-config.test.ts` asserts that naming rule so a rename cannot quietly undo
it. No request path uses it; request handling uses the anon key and acts as the
signed-in person, so RLS still applies.

### Session reading

`getSupabaseUser` calls `getUser()`, not `getSession()`. `getSession()` reads the
cookie and trusts it; `getUser()` verifies the token with Supabase. For deciding
who may read a restoration case, a forged cookie should not be able to answer.

### Three layers, in order

`getViewer` resolves, in this order:

1. **A real Supabase session**, mapped to a `people` row by `auth_user_id`, with
   roles and grants read from the database — so clearance is derived from live
   rows, not from the auth provider. A Supabase user is an identity, not a
   permission.
2. **The sample-data switch**, only under `FOLD_DEMO_MODE=1`.
3. **A refusal.**

A signed-in account with no linked person raises `NoPersonForAccountError` rather
than getting a default identity — that is an administrative gap, and the answer is
to link them, never to guess. Signing in successfully and falling through to a demo
identity would be the worst of the available bugs, so layer 1 never falls back to
layer 2.

Role names the database holds that this build does not recognise are dropped
rather than trusted: a role Fold cannot evaluate must not become access.

### Deliberate vagueness

A failed password sign-in says "that email and password do not match" without
distinguishing a wrong password from an unknown address. Telling them apart
confirms which addresses belong to people at this church. Magic-link and reset
replies are non-committal for the same reason, and `shouldCreateUser: false` means
a stranger's address cannot bring an account into existence — people come from the
directory and from Planning Center.

### Signing out

`POST /auth/sign-out` calls Supabase's `signOut` (ending the session server-side,
so a stolen refresh token stops working) and answers `303` through
`identity-change.ts`, forcing a new document. A Server Action would leave the
previous reader's RSC payload in the page.

The callback route validates its `next` parameter against a fixed allow-list
rather than a prefix check — a path is easy to smuggle past `startsWith('/')`, and
this is the redirect an attacker would most like to influence.

## The default role is care volunteer

Confirmed 2026-07-26. A new person holds `care_volunteer` until an administrator
changes it — `DEFAULT_ROLE` in `src/domain/roles.ts` is the single place that
decides this, which is why `leader_roles.role` has no column default that could
disagree with it.

A care volunteer reaches `all_leaders` and can log care and view people. Nothing
administrative, no pathway editing, and no elder tier. The default is the floor
on purpose: widening someone's access should be a deliberate act, not something
an administrator has to remember to undo.

The remaining clearance defaults — administrator and the pathway workflow roles
reaching nothing, executive assistant capping at `all_leaders` — matter only when
one of those roles is deliberately assigned, and any of them can be widened per
person by a recorded grant.

## Sample data is not configuration

Everything in `src/data/sample.ts` is example content for One Family Church.
Stage counts, follow-up windows, capacity figures, whether baptism gates
membership — all per-church, none of it a schema default.

Note `church_profile_entries.provenance`: every profile value must declare
whether it is `confirmed`, `imported`, or `inferred`. **An inference is never
treated as policy.**

## Vocabulary

Church, guest, member, disciple, pathway, stage, milestone, fold, connector,
shepherding, pastoral review. Never lead, prospect, customer, deal, funnel, or
conversion opportunity. This shaped design decisions and is not a style
preference.
