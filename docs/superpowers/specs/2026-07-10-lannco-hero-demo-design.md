# LANNCO 3D Hero Demo — Design Spec

**Date:** 2026-07-10
**Status:** Approved by Anamika

## Context

Sasha (prospective client, referred by Fifi) wants a website in the style of
https://www.tresmarescapital.com/en/ — her own mockup is "LANNCO": an ink-wash
(sumi-e) mountain hero with a red silk ribbon, 嵐 calligraphy seal, cream /
black / crimson palette, serif typography. She is undecided about hiring
Anamika because she has no proof the interactive 3D can be built. This demo is
the proof: a live URL she can open on her phone.

The demo is built in Astro so that, if she signs, it becomes the seed of the
real multi-page site (About, Capabilities, Sectors, Journal, Contact) rather
than a throwaway.

## Goals & success criteria

1. Real 3D (not a video, not a static image): the mountain scene responds to
   mouse on desktop and drifts subtly on mobile.
2. Premium load-in and scroll choreography comparable to the reference site.
3. Flawless on a phone at 390px width — that is where she will open it first.
4. Deployed to a free live URL; total page weight and FPS good enough that it
   feels instant on 4G.
5. Accompanied by a short WhatsApp pitch message with a concrete next step.

## Non-goals

- Full site (only hero + one teaser section).
- CMS, contact form, journal articles, multi-language.
- Pixel-perfect reproduction of the mockup's AI-generated photography — the 3D
  scene is a stylized ink-wash interpretation, which is the selling point.

## Stack

- **Astro** (static output) — same stack as mc2-website
- **three** — 3D scene
- **gsap** + ScrollTrigger — load-in and scroll animation
- **lenis** — smooth scroll
- Fonts: **Cormorant Garamond** (serif display) + **Jost** (small-caps UI)

## Project structure

```
lannco-demo/
├─ astro.config.mjs
├─ src/
│  ├─ pages/index.astro        # nav, hero, tease section markup
│  ├─ scripts/scene.js         # Three.js: renderer, mountain, ribbon, mist, camera
│  ├─ scripts/animations.js    # Lenis + GSAP: load-in timeline, ScrollTrigger
│  └─ styles/global.css        # palette, type scale, layout, responsive rules
└─ docs/superpowers/specs/     # this spec + implementation plan
```

Each script has one clear responsibility and a small public interface:
`scene.js` exports `initScene(canvas)` returning `{ setScrollProgress(p),
setPointer(x, y) }`; `animations.js` owns all timelines and calls into that
interface. Markup and styles never reach into Three.js internals.

## Visual design

**Palette**

| Token | Value | Use |
|---|---|---|
| `--cream` | `#f2efe9` | page + fog background |
| `--ink` | `#1a1816` | text, dark ridge shading |
| `--crimson` | `#a41f24` | ribbon, "People.", seal, CTA arrow |
| `--gray-wash` | `#6b6560` → `#c9c4bc` | ridge shading gradient toward fog |

**Type:** Cormorant Garamond for the headline (large, tight leading);
Jost in letter-spaced small caps for nav, labels, ticker.

## 3D scene (`scene.js`)

- Cream background with dense exponential fog — everything fades to paper
  white with distance, giving the sumi-e look.
- **Mountain:** 2–3 ridge meshes (PlaneGeometry, ~256×128 segments desktop)
  displaced by fbm noise shaped so a sharp central peak dominates.
  Custom ShaderMaterial shades by height + slope in ink grays; each farther
  ridge sits deeper in fog so layers stack like an ink painting.
- **Red ribbon:** TubeGeometry along a CatmullRom curve sweeping across the
  mid-slope. Shader animates a flowing gradient along its length (UV offset)
  with fresnel edge glow; color `--crimson`, slight additive brightness.
- **Mist:** a few hundred soft particles drifting slowly near the base.
- **Camera:** fixed look-at on the peak.
  - Desktop: lerps toward pointer position — subtle orbit parallax.
  - Mobile / no pointer: slow autonomous drift (sinusoidal, ~20s period).
  - Scroll: `setScrollProgress(p)` pulls the camera down/back and raises fog
    density as the tease section approaches.

## Page & choreography (`index.astro`, `animations.js`)

**Nav:** LANNCO wordmark (letter-spaced serif), links About · Capabilities ·
Sectors · Journal · Contact (non-functional anchors in the demo), red seal
mark top-right.

**Hero:** headline "Connecting Capital. Markets. People." — "People." in
crimson; DISCOVER MORE → link; SCROLL TO EXPLORE marker bottom-left; large
translucent 嵐 watermark behind the right half; bottom region ticker
ASIA · MIDDLE EAST · EUROPE · AFRICA with an animated progress line.

**Load-in (first 3 seconds are the pitch):** page fades from cream; headline
lines stagger up with a soft mask reveal; ribbon draws in (scale/opacity along
the curve); nav and ticker fade last.

**Scroll tease:** one viewport-height section, "About LANNCO" + 2–3 short
lines from her mockup ("independent cross-border advisory… connecting capital,
markets, and people across Asia, the Middle East, Europe and Africa").
ScrollTrigger scrubs: camera descends, fog thickens, hero text parallaxes up
and fades, about-text lines stagger in. Ends with OUR STORY → link (anchor).

## Responsive & performance

- Device pixel ratio capped at 2; ridge segment counts halved on mobile.
- Hero text stacks above the canvas focal point at ≤ 768px; no horizontal
  scroll at any width; tap targets ≥ 44px.
- Canvas pauses rendering when the tab is hidden.
- Only system fallbacks flash: fonts loaded with `font-display: swap`.
- Target: 60fps desktop, ≥ 30fps mid-range phone, < 1MB JS gzipped.

## Deployment

`astro build` → static `dist/`. Deploy to Vercel (`npx vercel`) if logged in,
else GitHub Pages via a new repo. **Nothing is pushed publicly without
Anamika's explicit go-ahead.** Verify the live URL on desktop + phone widths
before sending anything to Sasha.

## Verification

1. `cd /Users/anamika/work/lannco-demo && bun run dev` (explicit cd — shell
   cwd drifts between worktrees).
2. Playwright screenshots at 390 / 768 / 1440 px: hero composition, mid-scroll,
   tease section fully revealed.
3. Zero console errors; scroll flow works end-to-end; load-in plays once.
4. `astro build` + preview of the production build, same checks.

## Deliverable

Live URL + drafted WhatsApp message: link, "real 3D in custom code on free
hosting — open on your phone and move/scroll", built quickly, invitation to
discuss scope / timeline / price.
