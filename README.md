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
| People, households, folds, leaders (§2) | Schema + migration generated |
| Restoration cases, care notes, change log | Schema + access rules |
| One screen exercising the tier model | Built, checked per viewer |
| Identity-change transport (sign-out safety) | Built and tested |
| Pathways, journeys, Planning Center, AI | Not started (§11 steps 3–9) |
| Real authentication | Not started — see "The auth gap" below |

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

### Access to restoration cases is by case, not by title

Checked *before* clearance. An elder with full `elders_only` clearance who is
not named on a case is refused, and sees only that the case exists and how it
ended. This is the handoff's §3 rule 2 and the product's hardest case; it has
its own tests.

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

**Three transitions are marked `inferred`.** §4 lists `discovery` and `scheduled` among
the states but gives no transition reaching either. Rather than quietly invent policy,
those are implemented the obvious way and flagged — the same instinct as the handoff's
`provenance` field. Worth confirming.

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

## The auth gap

`src/data/viewer.ts` **throws in production**. There is no fallback viewer,
because a fallback viewer is a silent authorization bypass. What exists is a
development-only cookie switch so the tiers can be reviewed, and it is labelled
as such in the UI.

That module only ever *reads* a session. The write side — sign-in, sign-out,
account switch — goes through `src/auth/identity-change.ts`, and the reason is a
measured defect rather than a preference:

**An identity change must replace the document, not patch it.** Redaction is
delivered as RSC payload embedded in the document that served it. A Server
Function that writes the session cookie re-renders in place, leaving the
previous reader's flight chunks in the live document — measured on the dev
switch, where moving from an elder to an administrator left `elders_only` note
bodies in `document.documentElement.outerHTML` that a fresh request for the
administrator correctly omitted. For a dev switch that is untidy; for a real
sign-out it means the next person at the keyboard can read the last one's care
notes out of the DOM, and the Back button can restore the whole document.

So identity changes are a plain form POST to a Route Handler answering `303`,
which forces a top-level GET and discards the old document, its router cache,
and its payload. `Clear-Site-Data` and `no-store` harden it further. Whatever
real authentication looks like, its sign-in and sign-out controls submit the
same way — and never from a Server Function.

The route verifies its own preconditions, since a POST endpoint that clears
sessions is worth forging: refused in production, refused cross-origin, refused
when `Origin` is absent, and the requested id must name a known viewer and is
never echoed back.

## Roles are defaults; grants are exceptions

Roles supply a starting position. An **administrator can give any individual any
permission, and any clearance tier** — polity and staffing differ per church, and
the handoff warns against hardening one church's answers into the schema.

What the design insists on is that every exception is answerable:

- A grant names the **person** who made it, not their role — a role cannot be
  held accountable (§4).
- A written **reason** is required, `not null` in the schema.
- Revoking stamps the row rather than removing it, so "who gave them that, and
  when did it end?" stays answerable.
- A grant only ever **raises** access. Lowering someone is a role change, so two
  mechanisms never disagree with the permissive one winning by accident.
- `permissionCheck` reports whether an allowance came from a `role` or a
  `grant`, and the note tells the holder who granted it and why.
- Every exception appears on one review list, `getGrantedExceptions`, rendered as
  "Access beyond role". **Self-grants are flagged** — an administrator raising
  their own clearance is legitimate (covering a vacancy, verifying an import) and
  also the obvious abuse path, so it is called out rather than blended in.

### The one thing a grant cannot do

**A granted clearance does not open a restoration case.** §3 rule 2 says access is
by case. The case check runs before clearance is consulted, so the source of the
clearance makes no difference. Checked by requesting the page as an administrator
holding a self-granted top clearance: still `restoration_case_not_carried`, with no
case content in the payload.

So an administrator can raise anyone's clearance without that reaching case
content. The exception is the lead pastor, whose office grants it directly — see
below.

### One administrator is enough — decided

A grant of `elders_only` clearance needs **one** administrator, not two.
Requiring a second to countersign, by analogy with §3's "never one elder alone",
was raised and declined by the lead pastor on 2026-07-26. The safeguard is
visibility rather than a second gate.

This is recorded rather than merely absent. §8.8 says a considered omission must
be distinguishable from an oversight, and that applies to governance as much as
to a stage with no stopping rule — so the test
`a single administrator can grant elders_only` holds the decision open. Adding a
countersign requirement later will fail that test, which is the point: it should
take a decision, not a quiet tightening.

## The lead pastor holds the highest authority — decided

Confirmed 2026-07-26. `lead_pastor` is the only role in `UNRESTRICTED_ROLES`: it
carries **every** permission, can grant and revoke access for anyone, can change
any setting, and reaches `elders_only`.

It is written as a short-circuit rather than by listing `lead_pastor` in all
fifteen `PERMISSION_HOLDERS` entries — §8.1 again. A permission added six months
from now is included automatically, where a hand-maintained list would silently
omit it and quietly narrow the role. The test
`a lead pastor holds every permission` iterates `PERMISSIONS` to keep that true.

An earlier default capped the role at `staff_and_elders`, on the theory that
elder-board membership rather than the title should open the top tier. That was
the wrong default for a polity that puts final authority in the role.

### Including every restoration case

Confirmed 2026-07-26: the lead pastor reads **every** restoration case, named on
it or not. This is the one place Fold departs from §3 rule 2's "access is by case,
not by title", and it is a deliberate polity decision rather than an oversight.

It is scoped as narrowly as the decision allows:

- **`UNRESTRICTED_ROLES` only.** Every other route to top clearance still stops at
  the case boundary — another elder, an administrator, and a *granted*
  `elders_only` clearance are all still refused. Tests cover each.
- **The basis is recorded.** Every view carries a `basis` of `named_on_case` or
  `office`, available for an audit trail rather than reconstructed later. Nothing
  in the UI displays it.
- **Clearance is still checked**, not bypassed. Office is additional to the tier
  rather than a substitute for it.

`restoration.assign_elders` — the power to name who carries a case — is held by
elders and the lead pastor, and deliberately **not** by `administrator`. §3 rule 2
only retains meaning for everyone else if the power to change who carries a case
is itself limited; an administrator who could add themselves to a case would have
routed around the whole tier model.

## Judgment calls still to confirm

Two role decisions remain defensible readings of §5 rather than facts from it.
They set the **defaults** — each can be overridden per person by a recorded
grant. Both are in `ROLE_CLEARANCE` (`src/domain/roles.ts`).

1. **Administrator has no pastoral care clearance at all.** §5 scopes the role
   to settings, integrations, templates, roles, publishing, and reporting.
   Letting whoever configures the software read every restoration case would
   defeat §3. (`pathway_designer` and `reviewer_approver` likewise — they are
   workflow roles over configuration, not people.)
2. **Executive Assistant caps at `all_leaders`.** §5 says no *automatic* access
   to confidential pastoral content, and "confidential" begins at
   `staff_and_elders` in §3's table. "Automatic" implies it can be granted,
   which here happens by also holding another role.

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
