# LANNCO 3D Hero Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live, deployed demo of the LANNCO hero — real-time 3D ink-wash mountain with a crimson ribbon, load-in choreography, and a scroll-scrubbed About tease — to convert Sasha.

**Architecture:** Astro static page. `src/scripts/scene.js` owns everything Three.js and exposes `initScene(canvas) → { setPointer, setScrollProgress, setRibbonDraw }`. `src/scripts/animations.js` owns Lenis + GSAP timelines and drives the scene only through that interface. Markup/styles never touch Three.js.

**Tech Stack:** Astro ^7, three, gsap (ScrollTrigger), lenis, @fontsource (Cormorant Garamond + Jost), Playwright for verification, bun as package runner.

## Global Constraints

- Node >= 22, bun as package manager, dev server port **4325**, preview port **4326**
- Palette (exact): cream `#f2efe9`, ink `#1a1816`, crimson `#a41f24`, gray-wash `#6b6560`→`#c9c4bc`
- Breakpoints verified after EVERY task via Playwright: **390 / 768 / 1440** px — zero console errors, zero horizontal overflow. Never assume — verify.
- Device pixel ratio capped at 2; ridge geometry segments halved below 768px
- Rendering pauses when tab hidden; `prefers-reduced-motion` skips timelines
- Fonts self-hosted via @fontsource, `font-display: swap` (fontsource default)
- NOTHING is pushed to any public remote or host without Anamika's explicit go-ahead
- Every bash command runs with explicit `cd /Users/anamika/work/lannco-demo &&` (shell cwd drifts)

**Verification model:** this is a visual demo, so the test cycle is the Playwright harness (`scripts/verify.mjs`) instead of unit tests: it asserts no console/page errors, no horizontal overflow, canvas presence, and captures screenshots at all 3 widths (hero + scrolled-to-tease) which MUST be visually reviewed with the Read tool before commit.

---

### Task 1: Scaffold + Playwright verify harness (red)

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `src/pages/index.astro` (placeholder), `scripts/verify.mjs`

**Interfaces:**
- Produces: `bun run dev` (port 4325), `bun run verify` — used by every later task. Verify contract: exit 0 = pass, exit 1 with `VERIFY FAIL` + reasons.

- [ ] **Step 1: Write project files**

`package.json`:
```json
{
  "name": "lannco-demo",
  "type": "module",
  "version": "0.0.1",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "dev": "astro dev --port 4325",
    "build": "astro build",
    "preview": "astro preview --port 4326",
    "verify": "node scripts/verify.mjs"
  },
  "dependencies": {
    "@fontsource/cormorant-garamond": "^5.2.0",
    "@fontsource/jost": "^5.2.0",
    "astro": "^7.0.6",
    "gsap": "^3.13.0",
    "lenis": "^1.3.0",
    "three": "^0.182.0"
  },
  "devDependencies": {
    "playwright": "^1.61.1"
  }
}
```

`astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';

export default defineConfig({});
```

`tsconfig.json`:
```json
{ "extends": "astro/tsconfigs/base" }
```

`.gitignore`:
```
node_modules
dist
shots
.astro
```

`src/pages/index.astro` (placeholder — replaced in Task 2):
```astro
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>LANNCO — Connecting Capital. Markets. People.</title>
  </head>
  <body>
    <p>LANNCO</p>
  </body>
</html>
```

`scripts/verify.mjs`:
```js
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const url = process.argv[2] ?? 'http://localhost:4325';
const viewports = [
  [390, 844],
  [768, 1024],
  [1440, 900],
];
mkdirSync('shots', { recursive: true });

const problems = [];
const browser = await chromium.launch();
for (const [width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${width}px console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${width}px pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500); // let load-in choreography finish

  if ((await page.locator('canvas#scene').count()) === 0) {
    problems.push(`${width}px: canvas#scene missing`);
  }
  const overflow = await page.evaluate(
    () => document.scrollingElement.scrollWidth - window.innerWidth
  );
  if (overflow > 0) problems.push(`${width}px: horizontal overflow ${overflow}px`);

  await page.screenshot({ path: `shots/${width}-hero.png` });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/${width}-tease.png` });
  await page.close();
}
await browser.close();

if (problems.length > 0) {
  console.error('VERIFY FAIL\n' + problems.join('\n'));
  process.exit(1);
}
console.log('VERIFY PASS — review shots/*.png before committing');
```

- [ ] **Step 2: Install and start dev server**

Run: `cd /Users/anamika/work/lannco-demo && bun install`
Expected: lockfile written, no errors. If chromium missing later, run `cd /Users/anamika/work/lannco-demo && bunx playwright install chromium`.

Run (background): `cd /Users/anamika/work/lannco-demo && bun run dev`
Expected: `astro dev` serving on `http://localhost:4325`.

- [ ] **Step 3: Run verify — expect RED**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify`
Expected: **FAIL** with exactly `canvas#scene missing` at all 3 widths (proves the harness detects missing pieces). No other problems.

- [ ] **Step 4: Commit**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "chore: scaffold Astro project with Playwright verify harness"
```

---

### Task 2: Page markup + responsive styles (verify green)

**Files:**
- Create: `src/styles/global.css`
- Modify: `src/pages/index.astro` (full markup, NO `<script>` tag yet — scripts land in Tasks 3/5)

**Interfaces:**
- Produces: DOM contract used by later tasks — `canvas#scene`, `.hero .line-inner`, `.nav`, `.discover`, `.scroll-hint`, `.ticker`, `.tease`, `.about-line`, `.headline`.

- [ ] **Step 1: Write full markup**

`src/pages/index.astro`:
```astro
---
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/jost/300.css';
import '@fontsource/jost/400.css';
import '../styles/global.css';
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      name="description"
      content="LANNCO — independent cross-border advisory. Connecting capital, markets, and people."
    />
    <title>LANNCO — Connecting Capital. Markets. People.</title>
  </head>
  <body>
    <canvas id="scene" aria-hidden="true"></canvas>

    <header class="nav">
      <a class="wordmark" href="/">LANNCO</a>
      <nav class="links">
        <a href="#about">About</a>
        <a href="#">Capabilities</a>
        <a href="#">Sectors</a>
        <a href="#">Journal</a>
        <a href="#">Contact</a>
      </nav>
      <span class="seal" aria-hidden="true">嵐</span>
    </header>

    <main>
      <section class="hero">
        <span class="watermark" aria-hidden="true">嵐</span>
        <h1 class="headline">
          <span class="line"><span class="line-inner">Connecting</span></span>
          <span class="line"><span class="line-inner">Capital.</span></span>
          <span class="line"><span class="line-inner">Markets.</span></span>
          <span class="line"><span class="line-inner accent">People.</span></span>
        </h1>
        <a class="discover" href="#about">Discover more <span class="arrow">→</span></a>
        <span class="scroll-hint">Scroll to explore</span>
        <div class="ticker" aria-hidden="true">
          <span>Asia</span>
          <span>Middle East</span>
          <span>Europe</span>
          <span>Africa</span>
          <i class="ticker-line"></i>
        </div>
      </section>

      <section class="tease" id="about">
        <h2 class="about-title">About LANNCO</h2>
        <p class="about-line">
          We are an independent cross-border advisory and strategic introductions platform.
        </p>
        <p class="about-line">
          Connecting capital, markets, and people across Asia, the Middle East, Europe and Africa.
        </p>
        <p class="about-line">
          We operate with discretion, integrity, and a deep understanding of cultures, markets,
          and relationships.
        </p>
        <a class="discover" href="#">Our story <span class="arrow">→</span></a>
      </section>
    </main>
  </body>
</html>
```

- [ ] **Step 2: Write styles**

`src/styles/global.css`:
```css
:root {
  --cream: #f2efe9;
  --ink: #1a1816;
  --crimson: #a41f24;
  --gray: #6b6560;
  --serif: 'Cormorant Garamond', 'Hiragino Mincho ProN', 'Yu Mincho', serif;
  --sans: 'Jost', system-ui, sans-serif;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: auto;
}

body {
  background: var(--cream);
  color: var(--ink);
  font-family: var(--sans);
  font-weight: 300;
  overflow-x: hidden;
}

#scene {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  background: var(--cream);
}

.nav,
main {
  position: relative;
  z-index: 1;
}

/* ---------- nav ---------- */
.nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.4rem clamp(1.25rem, 4vw, 3rem);
}

.wordmark {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 1.35rem;
  letter-spacing: 0.35em;
  color: var(--ink);
  text-decoration: none;
}

.links {
  display: flex;
  gap: clamp(1rem, 2.5vw, 2.2rem);
}

.links a {
  color: var(--ink);
  text-decoration: none;
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.6rem 0.2rem; /* tap target */
}

.links a:hover {
  color: var(--crimson);
}

.seal {
  font-family: var(--serif);
  color: var(--cream);
  background: var(--crimson);
  width: 2.2rem;
  height: 2.2rem;
  display: grid;
  place-items: center;
  font-size: 1.05rem;
  border-radius: 2px;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 6rem clamp(1.25rem, 4vw, 3rem) 5.5rem;
}

.headline {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(2.6rem, 7.5vw, 6.2rem);
  line-height: 1.04;
  max-width: 12ch;
}

.line {
  display: block;
  overflow: hidden;
}

.line-inner {
  display: block;
  will-change: transform;
}

.accent {
  color: var(--crimson);
  font-style: italic;
}

.discover {
  margin-top: 2.4rem;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  min-height: 44px;
  color: var(--ink);
  text-decoration: none;
  font-size: 0.78rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.discover .arrow {
  color: var(--crimson);
  transition: transform 0.3s ease;
}

.discover:hover .arrow {
  transform: translateX(6px);
}

.scroll-hint {
  position: absolute;
  bottom: 5rem;
  left: clamp(1.25rem, 4vw, 3rem);
  font-size: 0.62rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--gray);
}

.watermark {
  position: absolute;
  top: 50%;
  right: clamp(0.5rem, 6vw, 6rem);
  transform: translateY(-52%);
  font-family: var(--serif);
  font-size: clamp(11rem, 30vw, 26rem);
  color: rgb(26 24 22 / 7%);
  pointer-events: none;
  user-select: none;
  line-height: 1;
}

.ticker {
  position: absolute;
  bottom: 1.8rem;
  left: clamp(1.25rem, 4vw, 3rem);
  right: clamp(1.25rem, 4vw, 3rem);
  display: flex;
  gap: clamp(1.2rem, 4vw, 3rem);
  font-size: 0.66rem;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--gray);
  padding-bottom: 0.7rem;
}

.ticker-line {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 1px;
  width: 100%;
  background: rgb(26 24 22 / 15%);
}

.ticker-line::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--crimson);
  transform-origin: left;
  animation: sweep 9s ease-in-out infinite;
}

@keyframes sweep {
  0% { transform: scaleX(0); }
  55% { transform: scaleX(1); transform-origin: left; }
  56% { transform-origin: right; }
  100% { transform: scaleX(0); transform-origin: right; }
}

/* ---------- tease ---------- */
.tease {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.4rem;
  padding: 6rem clamp(1.25rem, 4vw, 3rem);
  max-width: 46rem;
}

.about-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(2rem, 4.5vw, 3.4rem);
}

.about-line {
  font-size: clamp(0.95rem, 1.4vw, 1.1rem);
  line-height: 1.75;
  color: var(--gray);
  max-width: 34rem;
}

/* ---------- responsive ---------- */
@media (max-width: 768px) {
  .links {
    display: none;
  }

  .watermark {
    right: 0.25rem;
    font-size: 9.5rem;
    top: 32%;
  }

  .headline {
    margin-top: 8vh;
  }

  .ticker {
    flex-wrap: wrap;
    gap: 0.9rem 1.4rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ticker-line::after {
    animation: none;
    transform: scaleX(1);
  }
}
```

- [ ] **Step 3: Verify — expect GREEN + review screenshots**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify`
Expected: `VERIFY PASS` (canvas element now exists; no overflow, no console errors).
Then Read `shots/390-hero.png`, `shots/768-hero.png`, `shots/1440-hero.png`, `shots/390-tease.png` and confirm: headline legible and unclipped, nav not overlapping, watermark behind text, ticker on one line (wrapped neatly at 390), tease section readable. Fix CSS and re-run until right.

- [ ] **Step 4: Commit**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "feat: LANNCO hero and tease markup with responsive ink-wash styling"
```

---

### Task 3: Three.js scene — fog, layered ink ridges, camera

**Files:**
- Create: `src/scripts/scene.js`
- Modify: `src/pages/index.astro` (add temporary `<script>` before `</body>`)

**Interfaces:**
- Produces: `initScene(canvas) → { setPointer(nx, ny), setScrollProgress(p), setRibbonDraw(v) }` where `nx, ny ∈ [-1, 1]`, `p ∈ [0, 1]`, `v ∈ [0, 1]`. Task 4 extends internals; Task 5 consumes this exact API.

- [ ] **Step 1: Write the scene module**

`src/scripts/scene.js`:
```js
import * as THREE from 'three';

const CREAM = '#f2efe9';
const INK = '#1a1816';
const CRIMSON = '#a41f24';

const NOISE = /* glsl */ `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;

const RIDGE_VERT = /* glsl */ `
  uniform float uSeed;
  uniform float uPeak;
  uniform float uFogDensity;
  varying float vH;
  varying float vFog;
  ${NOISE}
  void main() {
    vec3 pos = position;
    float h = pow(fbm(pos.xz * 0.16 + uSeed), 1.6) * 6.0;
    float peak = exp(-pow(length(pos.xz - vec2(0.0, -2.0)) * 0.11, 2.0)) * uPeak;
    pos.y += h + peak * (0.45 + 0.55 * fbm(pos.xz * 0.5 + uSeed));
    vH = pos.y;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float dist = -mv.z;
    vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    gl_Position = projectionMatrix * mv;
  }
`;

const RIDGE_FRAG = /* glsl */ `
  uniform vec3 uFogColor;
  uniform vec3 uInk;
  varying float vH;
  varying float vFog;
  void main() {
    float shade = smoothstep(0.0, 9.0, vH);
    vec3 col = mix(uFogColor * 0.86, uInk, shade * 0.92);
    col = mix(col, uFogColor, clamp(vFog, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(new THREE.Color(CREAM));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    120
  );
  const CAM_BASE = new THREE.Vector3(0, 4.5, 15);
  camera.position.copy(CAM_BASE);

  const fogDensity = { value: 0.042 };
  const isMobile = window.innerWidth < 768;
  const seg = isMobile ? 128 : 256;

  const ridges = [
    { z: -4, seed: 3.1, peak: 9.0, width: 60 },
    { z: -15, seed: 7.7, peak: 7.0, width: 90 },
    { z: -28, seed: 12.4, peak: 5.5, width: 130 },
  ];
  for (const r of ridges) {
    const geo = new THREE.PlaneGeometry(r.width, 34, seg, Math.round(seg / 2));
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RIDGE_VERT,
      fragmentShader: RIDGE_FRAG,
      uniforms: {
        uSeed: { value: r.seed },
        uPeak: { value: r.peak },
        uFogDensity: fogDensity,
        uFogColor: { value: new THREE.Color(CREAM) },
        uInk: { value: new THREE.Color(INK) },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, -1.5, r.z);
    scene.add(mesh);
  }

  const pointer = { x: 0, y: 0, active: false };
  const scroll = { p: 0 };

  function setPointer(nx, ny) {
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }
  function setScrollProgress(p) {
    scroll.p = p;
  }
  function setRibbonDraw() {
    /* extended in Task 4 */
  }

  function tick(t) {
    const drift = pointer.active ? 0 : 1;
    const tx = pointer.x * 2.4 + drift * Math.sin(t * 0.00022) * 1.7;
    const ty = -pointer.y * 1.1 + drift * Math.cos(t * 0.00017) * 0.6;
    camera.position.x += (tx - camera.position.x) * 0.045;
    camera.position.y +=
      (CAM_BASE.y + ty - scroll.p * 5.5 - camera.position.y) * 0.055;
    camera.position.z = CAM_BASE.z + scroll.p * 5;
    fogDensity.value = 0.042 + scroll.p * 0.05;
    camera.lookAt(0, 4 - scroll.p * 2.5, 0);
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(tick);

  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { setPointer, setScrollProgress, setRibbonDraw, _internals: { scene, renderer, camera, fogDensity } };
}

export { CREAM, INK, CRIMSON, NOISE };
```

- [ ] **Step 2: Wire it up (temporary — Task 5 replaces this)**

In `src/pages/index.astro`, add before `</body>`:
```astro
    <script>
      import { initScene } from '../scripts/scene.js';
      initScene(document.querySelector('#scene'));
    </script>
```

- [ ] **Step 3: Verify + review screenshots**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify`
Expected: `VERIFY PASS`.
Read `shots/1440-hero.png` and `shots/390-hero.png`: layered gray mountain ridges with a dominant central peak fading into cream fog behind the headline, sumi-e feel, text still fully legible. Tune `uPeak`, fog density, or camera constants and re-run until it looks premium — this image is the pitch.

- [ ] **Step 4: Commit**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "feat: layered fbm ink-wash mountain scene with fog and parallax camera"
```

---

### Task 4: Crimson ribbon + mist particles

**Files:**
- Modify: `src/scripts/scene.js`

**Interfaces:**
- Produces: real `setRibbonDraw(v)` — ribbon reveals along its length as v goes 0→1 (Task 5 tweens this during load-in). Ribbon starts fully drawn (`uDraw = 1`) so the page never depends on animations.js to be visible.

- [ ] **Step 1: Add ribbon shaders and mesh**

In `src/scripts/scene.js`, add after `RIDGE_FRAG`:
```js
const RIBBON_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalMatrix * normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const RIBBON_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uDraw;
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    if (vUv.x > uDraw) discard;
    float flow = 0.5 + 0.5 * sin(vUv.x * 22.0 - uTime * 2.2);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    vec3 col = uColor * (0.72 + 0.42 * flow) + fres * 0.3;
    float alpha = 0.5 + 0.5 * flow;
    gl_FragColor = vec4(col, alpha);
  }
`;
```

Inside `initScene`, after the ridge loop, add:
```js
  const ribbonPts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ribbonPts.push(
      new THREE.Vector3(
        THREE.MathUtils.lerp(-16, 13, t),
        2.4 + Math.sin(t * Math.PI * 2.2) * 1.5 + t * 1.6,
        3.0 + Math.sin(t * Math.PI * 1.3) * 2.2
      )
    );
  }
  const ribbonGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(ribbonPts),
    isMobile ? 140 : 240,
    0.13,
    12,
    false
  );
  const ribbonMat = new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERT,
    fragmentShader: RIBBON_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uDraw: { value: 1 },
      uColor: { value: new THREE.Color(CRIMSON) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  scene.add(new THREE.Mesh(ribbonGeo, ribbonMat));

  const mistCount = isMobile ? 120 : 260;
  const mistPos = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    mistPos[i * 3] = (Math.random() - 0.5) * 50;
    mistPos[i * 3 + 1] = Math.random() * 2.5 - 1.2;
    mistPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 2;
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistTexCanvas = document.createElement('canvas');
  mistTexCanvas.width = mistTexCanvas.height = 64;
  const mctx = mistTexCanvas.getContext('2d');
  const grad = mctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(242,239,233,0.55)');
  grad.addColorStop(1, 'rgba(242,239,233,0)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, 64, 64);
  const mist = new THREE.Points(
    mistGeo,
    new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(mistTexCanvas),
      size: 7,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    })
  );
  scene.add(mist);
```

Replace the empty `setRibbonDraw` with:
```js
  function setRibbonDraw(v) {
    ribbonMat.uniforms.uDraw.value = v;
  }
```

In `tick(t)`, before `renderer.render`, add:
```js
    ribbonMat.uniforms.uTime.value = t * 0.001;
    mist.rotation.y = t * 0.000012;
```

- [ ] **Step 2: Verify + review screenshots**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify`
Expected: `VERIFY PASS`.
Read `shots/1440-hero.png` and `shots/390-hero.png`: crimson ribbon sweeping across the mid-slope, glowing softly, mist at the base; composition still balanced with headline. Tune ribbon curve points/radius if it collides with text at 390px.

- [ ] **Step 3: Commit**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "feat: flowing crimson ribbon and drifting mist"
```

---

### Task 5: Choreography — Lenis, load-in timeline, scroll scrub

**Files:**
- Create: `src/scripts/animations.js`
- Modify: `src/pages/index.astro` (replace the temporary script tag)

**Interfaces:**
- Consumes: `initScene(canvas) → { setPointer, setScrollProgress, setRibbonDraw }` from Task 3/4; DOM classes from Task 2.

- [ ] **Step 1: Write animations module**

`src/scripts/animations.js`:
```js
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initScene } from './scene.js';

gsap.registerPlugin(ScrollTrigger);

export function boot() {
  const api = initScene(document.querySelector('#scene'));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    api.setRibbonDraw(1);
    return;
  }

  const lenis = new Lenis({ smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  if (window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      api.setPointer(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
    });
  }

  const draw = { v: 0 };
  api.setRibbonDraw(0);
  gsap
    .timeline({ defaults: { ease: 'power4.out' } })
    .from('.hero .line-inner', { yPercent: 115, duration: 1.1, stagger: 0.12 }, 0.15)
    .to(
      draw,
      {
        v: 1,
        duration: 2.0,
        ease: 'power2.inOut',
        onUpdate: () => api.setRibbonDraw(draw.v),
      },
      0.4
    )
    .from(
      ['.nav', '.hero .discover', '.scroll-hint', '.ticker', '.watermark'],
      { opacity: 0, duration: 0.9, stagger: 0.08 },
      0.7
    );

  ScrollTrigger.create({
    trigger: '.tease',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    onUpdate: (self) => api.setScrollProgress(self.progress),
  });

  gsap.to('.hero .headline', {
    yPercent: -28,
    opacity: 0,
    ease: 'none',
    scrollTrigger: {
      trigger: '.tease',
      start: 'top bottom',
      end: 'top 35%',
      scrub: true,
    },
  });

  gsap.from('.about-title, .about-line, .tease .discover', {
    y: 44,
    opacity: 0,
    stagger: 0.14,
    duration: 0.85,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.tease', start: 'top 60%' },
  });
}
```

- [ ] **Step 2: Replace the script tag**

In `src/pages/index.astro`, replace the Task 3 script block with:
```astro
    <script>
      import { boot } from '../scripts/animations.js';
      boot();
    </script>
```

- [ ] **Step 3: Verify + review ALL screenshots**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify`
Expected: `VERIFY PASS`.
Read all 6 shots. Hero shots: load-in finished (headline fully up, ribbon fully drawn, nav visible — the 2.5s wait covers the ~2.6s timeline tail closely; if headline appears mid-animation, bump verify wait to 3200ms). Tease shots at every width: camera pulled down (mountain lower/foggier), about text fully revealed, no clipped lines at 390px.

- [ ] **Step 4: Commit**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "feat: load-in choreography and scroll-scrubbed about tease"
```

---

### Task 6: Production build + full responsive/perf pass

**Files:**
- No new files (fix-forward on any findings)

- [ ] **Step 1: Production build**

Run: `cd /Users/anamika/work/lannco-demo && bun run build`
Expected: build succeeds. Then check bundle size: `cd /Users/anamika/work/lannco-demo && du -sh dist && find dist -name '*.js' -exec du -h {} +`
Expected: total JS well under 1MB gzip target (three ~170KB gzip + gsap ~30KB + lenis ~10KB is fine).

- [ ] **Step 2: Verify the PRODUCTION build**

Run (background): `cd /Users/anamika/work/lannco-demo && bun run preview`
Run: `cd /Users/anamika/work/lannco-demo && bun run verify http://localhost:4326`
Expected: `VERIFY PASS`. Read all 6 screenshots once more — the production bundle is what ships; never assume dev == prod.

- [ ] **Step 3: Interaction spot-checks (Playwright, not assumptions)**

Write and run a one-off check in the scratchpad (not committed) that, at 1440px: dispatches `mousemove` events across the viewport and asserts two screenshots taken 600ms apart differ (parallax alive), and at 390px asserts the same (autonomous drift alive). Compare via buffer inequality:
```js
const a = await page.screenshot();
await page.waitForTimeout(600);
const b = await page.screenshot();
if (a.equals(b)) throw new Error('scene is static — animation dead');
```
Expected: both widths pass.

- [ ] **Step 4: Commit any fixes**

```bash
cd /Users/anamika/work/lannco-demo && git add -A && git commit -m "fix: production build hardening" # only if fixes were made
```

---

### Task 7: Deploy live + draft the WhatsApp pitch (USER GATE)

**Files:**
- None in-repo (deployment + message draft)

- [ ] **Step 1: STOP — confirm deployment with Anamika**

Ask which target: `npx vercel` (if logged in) or new GitHub repo + Pages. Do NOT push anywhere public without her explicit yes. Confirm repo/project name and whether the source should be public or just the built site.

- [ ] **Step 2: Deploy per her choice and verify the LIVE URL**

Run: `cd /Users/anamika/work/lannco-demo && bun run verify https://<live-url>`
Expected: `VERIFY PASS` against production hosting. Read the live screenshots.

- [ ] **Step 3: Draft the pitch message**

Deliver to Anamika (not sent anywhere automatically):

> Hey Sasha! Instead of explaining more, I built you a quick working preview of the LANNCO hero — real 3D, in code: <link>
> Open it on your phone and scroll — on a laptop, move the mouse over the mountain 🙂
> This is custom code on free hosting (no template or platform fees), and it took me about a day. If you like the direction, I'll put together the full scope, timeline and price for the complete site. What do you think?

- [ ] **Step 4: Tag the demo**

```bash
cd /Users/anamika/work/lannco-demo && git tag demo-v1
```
