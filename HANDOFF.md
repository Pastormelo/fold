# Fold — Developer Handoff

**What this is:** the rules extracted from the design prototype in `Fold Web.dc.html` and `Fold App.dc.html`, written for whoever builds the real application.

**What the prototype is:** a design artifact. Single-file HTML with in-memory state. No database, no auth, no API clients, no tests. Every array in it is sample content for One Family Church, not product configuration. Do not port the data; port the rules.

**How to read the prototype:** `Fold Web.dc.html` is the staff desktop app (nine rail sections). `Fold App.dc.html` is the mobile app for elders and greeters. Both are single files where a logic class computes values and a template renders them.

---

## 1. The product in one paragraph

Fold is a church care platform built on one premise: a person should not be able to quietly disappear. It tracks guests through an assimilation pathway, members through folds under a named elder, and both through care journeys triggered by life events. Its distinguishing behavior is that it refuses to let ownership be ambiguous, refuses to let follow-up run forever without a stopping rule, and refuses to let confidential pastoral notes leak.

**Vocabulary matters.** Church, guest, member, disciple, pathway, stage, milestone, fold, connector, shepherding, pastoral review. Never lead, prospect, customer, deal, funnel, or conversion opportunity. This is not a style preference; it shaped several design decisions.

---

## 2. Entity model

Names are indicative. Relationships and constraints are the point.

### People and structure

- **person** — the core record. Belongs to at most one **fold**. Has a `planning_center_id` when synced.
- **household** — groups people. Sourced from Planning Center.
- **fold** — a shepherding group with exactly one owning elder. A member with no fold is an open pastoral matter, not a data gap.
- **leader** — a person with one or more roles (see §5).

### Assimilation

- **pathway** — one active per church. Has `internal_name`, `public_name`, `philosophy`, `disciple_definition`, `status`, `version`, `source_template_id`.
- **pathway_version** — immutable snapshot per publication. Stores `version`, `published_at`, `change_summary`, `approved_by[]` (see §4 on attribution), `migration_choice`, and the full stage set. Never deleted.
- **stage** — belongs to a pathway version. Fields the prototype exercises: `name`, `public_name`, `subtitle`, `purpose`, `outcome`, `entry_condition`, `required_actions[]`, `optional_actions[]`, `owner_role`, `completion_condition`, `stopping_rule`, `reactivation_rule`, `escalation_rule`, `milestones[]`. Not every stage uses every field.
- **milestone** — a recordable event within a stage. Churches can define custom ones.
- **arrival** — a captured Sunday attendance with source (connection card, kids check-in, door recognition, walk-up, event signup), service, party composition, and an assigned owner.
- **touch** — one contact in a follow-up sequence, with a due window, an owner, and a logged outcome or a documented skip.

### Care

- **journey_template** — a care pathway for a situation (grief, hospital, new believer, new family, benevolence, marriage crisis, personal struggle, restoration). Has `trigger`, `visibility_tier`, and ordered steps. Church-editable; system defaults cannot be deleted, only edited.
- **journey_step** — `title`, `window` (same day, within 48 hours, week 1, week 2, month 1, month 3, month 6), `owner_role`, `guidance_note`.
- **journey_instance** — a template running on a person. Tracks current step, due date, last contact, owner.
- **care_note** — a logged conversation with a `visibility_tier` fixed at write time.
- **restoration_case** — elder-tier only. Has `opened_at`, two named elders, a written plan, a disclosure circle (who knows, who does not), a decision question, and a log. Closed cases are sealed, not deleted.
- **prayer_request** — with an optional recorded outcome, kept after answering.
- **benevolence_record** — amount, approver, what it covered. Staff-and-elder tier.

### Pathway Builder

- **church_profile** — every field carries a provenance of `confirmed`, `imported`, or `inferred`. **An inference is never treated as policy.** The prototype deliberately marks two capacity figures as inferences and states that a bottleneck conclusion depends on them.
- **discovery_session** / **discovery_answer** — seven sections, resumable.
- **ai_recommendation** — `noticed`, `why_it_matters`, `consequence`, `options[]`, `human_judgment`, plus a verdict of accepted, modified, saved, or rejected, each with a reason.
- **health_finding** — `category`, `severity`, `evidence`, `why`, `options[]`, `blocks_publishing`, `dismissed_by`, `dismissal_reason`.
- **integration_mapping** — milestone to external field, with a declared owning system.
- **change_log** — every state transition with actor and timestamp.

---

## 3. Confidentiality: three tiers

This is the most important rule in the product. Get it wrong and the app becomes gossip with a database.

| Tier | Who | Can read | Cannot |
|---|---|---|---|
| All leaders | Group leaders, deacons, staff, elders | Ordinary care: visits, calls, grief, hospital, new believers, milestones | Benevolence amounts, marriage and personal-struggle notes, restoration anything |
| Staff and elders | Pastoral staff and the elder board | The above, plus benevolence records, marriage crisis, personal struggle | Restoration case notes |
| Elders only | The elder board, **and only when named on the case** | Restoration cases in full, including plan and every logged conversation | Nothing is above this tier |

Enforcement rules the prototype demonstrates:

1. **Tier is set when the note is written**, not decided later under pressure by whoever is asking.
2. **Access is by case, not by title.** Being an elder does not open every case. The prototype shows a sealed closed case with person, fold, and elders all withheld from an elder who did not carry it.
3. **A blocked reader sees that care happened, never what was said.** Never a blank space and never a lie.
4. **Notes are kept, not deleted.** A deleted record protects the institution, not the person.
5. **Never one elder alone** on a restoration conversation, and never by text.
6. **The person knows what is written.** No secret file.

Implementation note: tiers are an ordered comparison (`all_leaders < staff_and_elders < elders_only`), not a set of booleans. An early version of the prototype gated only the top tier and leaked the middle one.

---

## 4. Pathway lifecycle

### States

`discovery → draft → internal_review → changes_requested → approved → scheduled → active → archived`

Only one version is `active` per church. Previous versions are `archived` and remain readable.

### Legal transitions

State changes **only** through actions, never by selecting a state. The prototype originally let users click a state chip directly, which meant clicking "Archived" claimed a live pathway was archived. That was wrong and was removed.

| Action | From | To | Who |
|---|---|---|---|
| Submit for review | draft | internal_review | Pathway Designer, Administrator |
| Request changes | internal_review, approved | changes_requested | Reviewer/Approver, Administrator |
| Approve | internal_review, changes_requested | approved | Reviewer/Approver, Administrator |
| Publish | approved | active | Approver, Administrator |
| Edit a stage | active, archived | draft | anyone who can edit |

Every transition records the acting **person** and a timestamp. Not a role string — a role cannot be held accountable.

### Publish blockers

Publishing requires all three, each derived from live data rather than a flag:

1. No blocking health findings, or they are explicitly acknowledged with a reason.
2. No reviewer holding with unaddressed changes.
3. A migration choice has been made.

Also shown before publishing: the diff against the active version, which stages changed, and how many people are in flight.

### Approval attribution

**"Objection marked addressed" is not "approved."** Track them separately. The permanent version record must not claim someone approved a pathway when they only had their objection resolved by someone else. In an elder-governance context, that is exactly the record someone will later rely on.

### Migration

When publishing, the administrator must choose explicitly:

- Existing people stay on the previous version
- Only new people enter the new version, previous archived read-only
- Migrate everyone in flight
- Decide person by person, generating a review list

**Never migrate existing participants automatically.** The choice is recorded on the version.

---

## 5. Roles and permissions

- **Administrator** — AI settings, templates, structure, integrations, roles, publishing, reporting.
- **Pathway Designer** — discovery, drafts, stage editing, reviewing recommendations. Cannot approve or publish.
- **Reviewer / Approver** — review, request changes, approve, publish.
- **Connection Team Leader** — operational feasibility input, uses published pathways.
- **Pastor / Elder** — theological, pastoral, and membership elements when authorized.
- **Lead Pastor** — vision, doctrine, culture, final direction.
- **Executive Assistant** — coordinates reviews and publishing logistics, **no automatic access to confidential pastoral content**.

`pathway.publish` must be a distinct permission from `pathway.edit`.

Rule learned the hard way in the prototype: any button whose permission note says a role cannot do something must actually not offer the action, and the note must match the gate. Copy and behavior drifted apart twice.

---

## 6. Planning Center integration

**Planning Center is the system of record for people and ministry data. Fold is the system of work for pathways and care.**

### The hard constraint

**Fold never creates a field, category, list, or status value in Planning Center.** When mapping, Fold offers only what already exists there. If nothing fits, the honest options are:

- keep the milestone in Fold only, or
- create it in Planning Center first and come back.

This applies to **values** as well as fields. If the membership status has no "Pending elder review" option, Fold cannot invent one.

### Sync scope is a per-category decision

Not everything syncs because it can. Each category is chosen, with a direction:

| Category | Direction |
|---|---|
| People and households | Both ways; Planning Center wins on conflict |
| New profiles | Both ways |
| Attendance and check-in | Planning Center to Fold |
| Forms and registrations | Planning Center to Fold |
| Membership status | Fold to Planning Center |
| Groups and serving | Planning Center to Fold |
| Ordinary care notes | Off by default |
| Confidential pastoral notes | **Never. Not syncable and not switchable.** |

### List mapping

Fold keeps its own **Family** list (members under an elder) and **Guest** list (anyone in the pathway who is not yet a member). Each maps to an existing Planning Center membership type or list, chosen by the church. Either can be kept Fold-only.

### Two-way profile creation

- Created in Fold → pushed to Planning Center, placed in the chosen membership type or list. Never a new one Fold invented.
- Created in Planning Center → appears in Fold on next sync, sorted into Family or Guest by the same mapping read in reverse.
- Matching order: Planning Center id, then email, then phone.
- **Near matches are surfaced as possible duplicates, never merged automatically.** A duplicate is visible and annoying; a wrong merge is two people's histories in one record.

### Never sync

Escalation reasons (the flag syncs so leaders know care is happening, the reason does not), restoration notes at any tier, benevolence amounts and reasons, marriage and personal-struggle notes. This is a property of the integration, not a setting.

---

## 7. AI behavior and guardrails

### The AI may

Ask questions, summarize answers, identify concerns, propose stages and milestones, draft communications, recommend assignments, analyze capacity, generate documentation.

### The AI must not

Publish or change an active pathway, make final membership or theological decisions, classify someone as a pastoral risk, assign confidential cases, invent denominational requirements, or present recommendations as spiritual authority.

### Recommendation shape

Every significant recommendation carries five parts, and the fifth is not optional:

1. What it noticed
2. Why it matters
3. The consequence if nothing changes
4. Possible responses
5. **Which part is the church's judgment, not the AI's**

Reasoning must cite the church's own answers, not general best practice. Compare:

> Bad: "Add a membership interview."
>
> Good: "Because your church requires affirmation of several secondary doctrines and elder approval is required by your polity, a pastoral interview may help clarify disagreement before the application reaches the elders."

Every recommendation supports accept, modify, save for later, and reject with a documented reason. **Rejections stay visible** so a future leader can see the finding was considered rather than missed.

### Import and Improve

Analysis quotes the line it came from and looks for: missing outcomes, redundant stages, unnecessary friction, unclear ownership, contradictory rules, theological inconsistencies, absent stopping rules, scalability limits, excessive pastoral dependency, weak post-membership connection, absent disciple-making, and privacy risks. Analysis never modifies the active pathway.

### Structured output

Define schemas for discovery answers, church profile, pathway proposal, stage proposal, milestones, health findings, recommendation reasoning, communication plan, and implementation plan. **Validate before persisting. Malformed AI output must never reach pathway configuration.**

Maintain an audit trail of prompts, significant recommendations, accepted and rejected verdicts with reasons, manual edits, and publication decisions.

---

## 8. Design invariants worth encoding as tests

These are the failures the prototype actually hit. Each one is worth a test.

1. **Derive, never mirror.** Every count, label, and gate must be computed from the data it describes. The prototype broke this repeatedly: a health-check flag independent of the findings, a version list independent of the version number, a hardcoded "Two findings" beside a live count of zero, sync errors that survived their own fix. If a number appears in copy, compute it.
2. **The subject of a claim must match what it was computed from.** "Already reflected in the published pathway" must be tested against the published pathway, not the working draft.
3. **A permission note and its gate must agree.**
4. **A disabled control must be disabled**, not merely styled as such.
5. **An action that reports success must have done something.** Guard no-op actions and say plainly when there is nothing to do.
6. **Draft state is derived from a diff against the published snapshot**, never set by hand. Otherwise a no-op can forge an unclearable dirty state.
7. **The diff must cover every editable field**, including arrays. A partial diff makes real changes invisible.
8. **Deliberate absence is not a defect.** A milestone intentionally unmapped, or a stage with no completion condition by design, must be distinguishable from an oversight.

Plus the spec's own list: draft pathways cannot affect active workflows; unauthorized users cannot publish; AI recommendations require human acceptance; publishing creates a new version; existing people are not migrated without an explicit choice; Planning Center mappings cannot expose confidential information; template customization does not modify the original; archived versions remain readable.

---

## 9. What the prototype covers, screen by screen

**Fold Web** — Fold (overview), Family (people with a person record drawer and a role-based tier switch), Journeys (running instances, template library, builder), Pathway (Begin, Design mode, Discovery, Blueprint, Health check, Review, Planning Center, Church profile, Templates, Versions), Guests (arrivals, pathway, coffee escalation, membership, reporting), Confidential (restoration cases, tiers, rules), Reports (charts, narrative builder, elder meeting mode), Setup.

**Fold App** — the mobile side: fold overview, person records, care logging, guest list, and greeter mode for capturing arrivals at the door.

---

## 10. Not built, and why

- **Pathway Builder's own reporting** (pathways created, drafts awaiting review, health scores, accepted versus rejected recommendations, time from discovery to publication). Deferred as least useful before real data exists.
- **Real document parsing** for Import and Improve. The analysis output is designed; the parsing is not.
- **Everything requiring a backend:** schema, migrations, auth, the permission system, the Planning Center API client, AI calls, and the test suite. These were never buildable in a design prototype and are the first work in a real codebase.

---

## 11. Suggested build order

1. People, folds, and the confidentiality tier model. The tier system touches everything; retrofitting it is painful.
2. Roles and permissions, with `pathway.publish` separate from `pathway.edit`.
3. Pathway data model with versioning and the draft/published split.
4. The lifecycle state machine with legal transitions and the change log.
5. Journeys and journey instances.
6. Planning Center sync, mapping constraints first.
7. AI discovery and recommendations with schema validation.
8. Health check.
9. Reporting.
