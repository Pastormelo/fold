# Fold — Start Here

> **Note added during the build.** This was written when Fold was a design
> prototype about to become a real build. It is kept because `HANDOFF.md` is still
> the authority and the reading order below is still right — but the `.dc.html`
> prototype files it refers to are **not in this repo**. They live alongside it in
> the original handoff folder. Everything they specified that has been built is
> described in `README.md`, which is the accurate account of current state.

You are picking up a project that exists as a **design prototype** and is now moving into a real build.

## Read in this order

1. **`HANDOFF.md`** — the spec. Entity model, confidentiality tiers, pathway lifecycle, roles, Planning Center rules, AI guardrails, and eight design invariants worth encoding as tests. This is the authority.
2. **`Fold Web.dc.html`** — the staff desktop prototype. Read it for interaction detail and copy, not for architecture.
3. **`Fold App.dc.html`** — the mobile prototype for elders and greeters.
4. The remaining `.dc.html` files are supporting artifacts: `Fold Landing` (marketing page), `Elders Report` (printable monthly report), `Fold - Shepherding Care` (early concept), `Fold Logo`.

## What these prototype files are

Single-file HTML design artifacts. Each has a template and a logic class, with all state in memory. They open in a browser and were built to make product decisions visible, not to be ported.

**Do not port the code.** There is no database, no auth, no API client, no test suite, and every data array is sample content for One Family Church.

**Do port:** the rules in `HANDOFF.md`, the interaction behavior, and the copy. The writing in these screens was deliberate and is worth preserving.

## Two things that will bite you if you skip them

**1. The confidentiality tier model touches everything.** Build it early. It is an ordered comparison (`all_leaders < staff_and_elders < elders_only`), not a set of booleans, and access to restoration cases is by case assignment rather than by role. Retrofitting this is painful. See `HANDOFF.md` §3.

**2. Derive, never mirror.** Most defects in the prototype were the same mistake: a count, label, or gate held as its own flag instead of computed from the data it described. A health-check gate independent of the findings. A version list independent of the version number. Hardcoded copy beside a live count that contradicted it. `HANDOFF.md` §8 lists all eight as testable rules. Encoding those as tests early will save real time.

## Sample data vs configuration

Everything One Family specific is example content, and the product's premise is that each church answers it differently: number of stages, stage names, whether baptism gates membership, follow-up windows, what requires elder review, capacity figures. Do not harden any of it into the schema as a default that cannot be changed.

Note the `provenance` field on church profile entries (`confirmed`, `imported`, `inferred`). An inference must never be treated as policy. The prototype deliberately shows two capacity figures marked as inferences, and a bottleneck conclusion that depends on them.

## Language

Church, guest, member, disciple, pathway, stage, milestone, fold, connector, shepherding, pastoral review. Never lead, prospect, customer, deal, funnel, or conversion opportunity.

## Where the design stopped

Phases 1 through 6 of Pathway Builder are designed: the three ways to begin, guided discovery across seven sections, AI blueprint review, health check, reviewer workflow with a real publish gate, Planning Center mapping, and import analysis.

Not designed: Pathway Builder's own reporting. Not built anywhere: everything requiring a backend.

Suggested build order is in `HANDOFF.md` §11.
