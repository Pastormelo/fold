# Design parity

What the prototype in `design/` contains, screen by screen, against what this app
actually renders. This file exists because the answer turned out to be "less than I
thought", and because there was no way to check.

**How to use it:** before calling a screen finished, open the prototype's version of
that screen and compare. Then mark the row. A row is only `Built` when somebody has
looked at both.

## Why things went missing

`HANDOFF.md` is a 17KB written summary of a 567KB working prototype, and this repo's
README named it "the specification and the authority". That was the mistake, and it
was a systematic one rather than bad luck.

The handoff is excellent at **rules** — the tier model, the permission matrix, the
pathway lifecycle, the §8 invariants — and those transferred nearly whole, with
tests. It describes **screens** in one line each. §9 covers the entire web app in a
single paragraph: "Guests (arrivals, pathway, coffee escalation, membership,
reporting)". Six words for six tabs. A line like that cannot carry a five-step
wizard, its copy, its empty states, or the way it feels to move through.

So everything that lived only in the prototype's markup got rebuilt from scratch,
which means it got rebuilt as *my* design rather than the one that was drawn. The
gap is not random: it is almost entirely the **sub-navigation layer** — tabs, steps,
and the guided flows inside a screen. Four tabbed areas were designed. The app has
no tabs anywhere.

Two things follow, and both are now true of this repo:

1. **The prototype lives in `design/` and is version-controlled.** It was sitting in
   a Downloads folder. It is 1.1MB. There was no reason for that.
2. **Authority is split.** `HANDOFF.md` is authoritative for rules and refusals.
   `design/Fold Web.dc.html` and `design/Fold App.dc.html` are authoritative for
   interface: layout, wording, flow, states. Where they disagree about a *rule*, the
   handoff wins — it was written to correct the prototype, and §8.1 says the
   prototype broke "derive, never mirror" repeatedly. Where they disagree about
   *interface*, the prototype wins.

## Reading the prototype

It is a working single-page app, not a picture. State lives in JS objects and the
markup is `sc-if` / `sc-for` templates, so the flows are readable directly:

```bash
grep -o "pcSteps: \[[^]]*\]" "design/Fold Web.dc.html"
```

Open `design/Fold Web.dc.html` in a browser to click through it. `design/_ds/`
carries the tokens and `support.js` the runtime, so it runs offline.

## Setup → Planning Center

Designed as a five-step wizard. Built as three stacked cards.

| Prototype | App | State |
| --- | --- | --- |
| Step 1 · Authorize — "Connect Planning Center" | Connection card, OAuth sign-in | **Built**, outside a wizard |
| Step 2 · Choose a list — "Which list should become your Family?" picks a *Planning Center list* (Covenant Members → Family, First-Time Guests → Guests), with "Everyone in Planning Center · 3,104 · not recommended" as the anti-pattern | Tick boxes mapping *membership values* | **Different mechanism.** The app maps membership values; the design picks a list. The design's warning — "nobody shepherds 3,000 names" — has no equivalent |
| Step 3 · Field owners — "Two systems, one truth per field. Planning Center wins on record; Fold wins on care work" | — | **Missing** |
| Step 4 · Preview — "What will land in Fold. A dry run before anything is written" | "See what would change" | **Built**, and it works |
| Step 5 · Sync — "Sync health. Failures queue instead of vanishing" | — | **Missing** |
| The stepper itself | — | **Missing.** This is what makes it feel guided rather than a wall of controls |
| Four integrations: Planning Center, Breeze, Church Windows, Spreadsheet/CSV | Planning Center only | **Partial by choice** — but nothing on screen says the others were considered |

## Guests

Six tabs designed, from `guestTabs`. The app is one 231-line list.

| Prototype tab | App | State |
| --- | --- | --- |
| Arrivals | the list | **Partial** |
| Today | — | **Missing** |
| Pathway | — | **Missing** |
| Coffee & escalation | — | **Missing** |
| Membership | — | **Missing** |
| Reporting | — | **Missing** |

## Confidential

Three tabs designed, from `cTabs`.

| Prototype tab | App | State |
| --- | --- | --- |
| Restoration cases | "Restoration" + "Open a case" | **Built** |
| Who sees what | "Three tiers" section | **Built**, as a section rather than a tab |
| The rules | — | **Missing** |

## Journeys

Three tabs designed, from `jTabs`.

| Prototype tab | App | State |
| --- | --- | --- |
| Running now | "Running now" | **Built** |
| The library | "Templates" | **Built** |
| Build one | — | **Missing** |

## Pathway

The one screen where sub-navigation did transfer, because building the four AI tabs
was its own task rather than a line in a summary. Discovery, Blueprint, Health check
and Review are all present. Church profile, Templates and Versions are listed in
HANDOFF §9 and need checking against the prototype.

## Not yet audited

Fold (overview), Family and the person drawer, Notes, Prayer, Milestones, Tasks,
Reports, Setup as a whole, and everything in `design/Fold App.dc.html` — the mobile
product, which HANDOFF §9 describes as a different application with greeter mode,
not a narrow version of this one. `design/Fold Landing.dc.html` and
`design/Elders Report.dc.html` have never been looked at against the app at all.

These are unaudited, which is not the same as missing. Nobody has compared them yet.
