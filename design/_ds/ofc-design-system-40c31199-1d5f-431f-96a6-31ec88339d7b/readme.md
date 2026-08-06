# One Family Church — Design System

A brand & UI design system for **One Family Church**, a multi-generational church ("one church, many people"). It packages the church's logo suite, color palette, type system, reusable UI components, a marketing-website UI kit, and a sermon-slide template so any team can produce on-brand sites, decks, and graphics.

> **Tagline / posture:** *One family, made of many.* Warm, welcoming, low-pressure, modern.

## Sources provided
The system was built from the official brand package the user supplied in `uploads/`:
- **Logos** (vector + raster): `Main`, `Main Reversed`, `Horizontal`, `Horizontal Reversed`, `Social Icon` (+ reversed) in `.svg / .png / .pdf / .eps`.
- **Color sheets:** `One Family Church - Colors RGB.pdf` (web) and `… CMYK.pdf` (print) — the source of the palette below.
- **Sub-brand slides:** `One Family Slides-11/12/15.jpg` — *One Family Kids* and *Lil Ones Kids* logos.

No website code, Figma file, or brand-guidelines document was provided, so **content voice and visual-foundation rules below are inferred** from the assets + church-brand conventions. Confirm against any official brand guide if one exists.

---

## CONTENT FUNDAMENTALS
How One Family writes.

- **Voice:** warm, personal, plain-spoken, never churchy or formal. Talks *with* people, not *at* them.
- **Person:** second person ("**you're** not meant to do life alone", "we saved **you** a gift"). "We" = the church family. Invitational, never commanding.
- **Tone:** low-pressure and reassuring. Repeatedly removes friction for newcomers ("come as you are", "zero pressure", "questions and all", "we know it can feel like a lot").
- **Casing:** Sentence case for body and most headlines. **UPPERCASE with wide tracking** for short labels/eyebrows only — echoing the logo's "ONE FAMILY / CHURCH" lockup (e.g. `WELCOME HOME`, `NEW HERE?`, `THIS WEEK`).
- **Headlines:** short, human, often emotional or relational — "Find your people", "A place for every season", "You're not meant to do life alone." Verb-led CTAs: "Plan your visit", "Give now", "Watch online", "Join a group".
- **Length:** brief. One idea per block. Generous white space over dense copy.
- **Emoji:** not used. Keep it clean and typographic.
- **Numbers/labels:** spell out service times naturally ("Sundays · 9:00 & 11:00 AM"). Use real, specific details (address, what to expect) rather than vague filler.

---

## VISUAL FOUNDATIONS
The look and feel.

- **Color vibe:** confident **orange (`#FF953E`)** as the single hero accent against a near-black **ink (`#20242A`)** and cool **slate grays**. Page background is a barely-blue off-white **paper (`#F4FBFE`)**, never pure white. Sub-brands shift the accent to **teal/blue** (Kids) while keeping the same ink + slate structure.
- **Type:** geometric monoline sans throughout (display face mirrors the wordmark). Big, tight-tracked, heavy display headings (800 weight, negative letter-spacing); clean humanist body. UI labels are tracked uppercase.
- **Backgrounds:** two modes — light **paper** sections and dark **ink** sections — alternated for rhythm. Hero & ministry blocks use **full-bleed photography with a dark left-to-right scrim gradient**; text sits on the dark side. No busy patterns or textures. Gradients are used sparingly and only within-brand (orange→deep-orange CTA band, photo scrims).
- **Imagery:** warm, candid, community-focused photography. Placeholder covers in `assets/images/` are brand-tinted gradients with a faint logo-mark watermark — **swap for real photos**.
- **Corner radii:** modest and geometric. Cards `16px`, controls/buttons `8px`, inner chips `12px`, large feature panels `24px`, pills/avatars/tags fully round.
- **Cards:** white surface, `1px` hairline border (`--border-subtle`), soft **cool-slate-tinted shadow** (`--shadow-sm`). Interactive cards lift `-3px` and gently zoom their cover image on hover.
- **Shadows:** layered, soft, low-opacity, tinted with the slate ink (never neutral gray or black). A dedicated warm `--shadow-brand` glow sits under primary buttons on hover.
- **Borders:** hairline neutral (`--border-default`); inputs go orange on focus. Reversed/dark surfaces use `rgba(255,255,255,0.1–0.18)`.
- **Buttons:** square-ish (`8px`), 700-weight tracked labels. Primary = orange on ink text; secondary = solid ink; outline + ghost for tertiary. Hover lifts `-1px` + warm glow; press scales to `0.98`.
- **Hover states:** color-shift (orange darkens one step; nav links pick up a soft-orange wash) plus subtle lift on cards/buttons. **Press:** slight shrink, no color shock.
- **Motion:** quick and gentle. `--ease-out` cubic-bezier(0.22,1,0.36,1); durations 0.14–0.4s. Fades and small translates only — no bounces, no infinite loops. Respects `prefers-reduced-motion`.
- **Transparency & blur:** sticky header becomes translucent paper with `backdrop-filter: blur` after scroll. Photo scrims use rgba ink. Otherwise surfaces are opaque.
- **Layout:** centered `1200px` container with a fluid `--gutter`; fluid vertical `--section-y` rhythm. Sticky header. 4px spacing grid.

---

## ICONOGRAPHY
- **No proprietary icon set** was provided in the brand package.
- The UI kit uses **[Lucide](https://lucide.dev)** (loaded from CDN) — clean, geometric, 2px-stroke line icons that match the brand's geometric monoline character. Wrapped by `ui_kits/website/Icon.jsx` (`<Icon name="map-pin" />`). **This is a substitution** — replace with the church's chosen set if one exists.
- **The logo mark** (the "flag/F" device) doubles as the brand glyph — favicon, watermark, avatar, app icon. It ships in single-color treatments for any context: `assets/logos/mark-color.svg` (full colour), `mark-orange.svg`, `mark-ink.svg`, `mark-white.svg`, and `mark-reversed.svg` (light gray for dark backgrounds), all transparent SVG (+ PNG). Official square **social / app icons** (light + reversed, with the brand's own rounded-corner padding) are in `assets/logos/onefamily-social-icon.svg` / `…-reversed.svg` — use these for profile avatars, app tiles, and favicons.
- **No emoji** and no Unicode-character icons. Arrows in CTAs use the literal "→" or a Lucide `arrow-right`.

---

## ⚠️ Substitutions to confirm (please send originals)
1. **Fonts** — no brand font files were provided. Display/headings use **Montserrat**, body uses **Mulish** (Google Fonts) as the closest geometric match to the wordmark. *If you have the real brand typefaces, send them and we'll swap `tokens/fonts.css`.*
2. **Icons** — Lucide stands in for an unspecified icon set (see above).
3. **Photography** — placeholder brand-gradient covers stand in for real church photos.

---

## INDEX / MANIFEST

**Root**
- `styles.css` — global entry point (consumers link this). `@import`s only.
- `readme.md` — this guide.
- `SKILL.md` — Agent-Skills wrapper.

**`tokens/`** — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `effects.css`, `base.css`.

**`assets/`**
- `logos/` — horizontal & stacked lockups (light + reversed), the icon mark, social icons.
- `brand/` — sub-brand marks (One Family Kids, Lil Ones Kids).
- `images/` — brand-tinted placeholder cover images.

**`components/`** (read via `window.DesignSystem_40c311`)
- `core/` — `Button`, `Badge`, `Card`, `Input`, `Avatar`, `SectionHeading`.
- `patterns/` — `EventCard`, `SermonCard`.

**`guidelines/`** — foundation specimen cards (Colors, Type, Spacing, Brand) for the Design System tab.

**`slides/`** — branded slide specimens: series title, scripture, sermon point, announcements.

**`ui_kits/website/`** — interactive marketing-site recreation (Home / Messages / Give). See its `README.md`.

**`templates/sermon-slides/`** — reusable 16:9 sermon-deck template (`SermonSlides.dc.html`).
