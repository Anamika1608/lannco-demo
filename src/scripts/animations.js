import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initOverlay } from './overlay.js';

gsap.registerPlugin(ScrollTrigger);

export function boot() {
  const mountain = document.querySelector('.mountain');
  const fogVeil = document.querySelector('.fog-veil');
  const overlayCanvas = document.querySelector('#overlay');
  // WebGL init (context creation, shader compile) can throw synchronously on
  // unsupported/exhausted GPUs -- if it does, overlay stays null and the
  // fallback <img class="mountain"> (never hidden in that case) carries the
  // hero alone, same as before this depth-displacement layer existed.
  let overlay = null;
  if (overlayCanvas) {
    try {
      overlay = initOverlay(overlayCanvas, mountain);
    } catch (e) {
      overlay = null;
    }
  }

  // "Our story" has no destination in this demo -- href="#" is kept as a
  // visual CTA but must not natively jump the page to top. Install this on
  // both the reduced-motion and normal paths, before the early return.
  const teaseDiscover = document.querySelector('.tease .discover');
  if (teaseDiscover) {
    teaseDiscover.addEventListener('click', (e) => e.preventDefault());
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    // Ribbon fully drawn, no draw-in animation; still fed the native-scroll
    // progress below so it dissolves ahead of the About section like the
    // normal path, but with zero other motion.
    if (overlay) {
      overlay.setRibbonDraw(1);
      overlay.setReducedMotion(true);
    }
    // Keep the hero's scroll state correct without any motion: mirror the
    // normal path's ScrollTrigger range ('top bottom' -> 'top top' on .tease)
    // with a native passive scroll listener, driving ONLY the fog veil's
    // opacity so the About section stays legible over a calming veil. No
    // Lenis, no GSAP, no other transform-driven motion in this branch.
    const tease = document.querySelector('.tease');
    const updateProgress = () => {
      const rect = tease.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / window.innerHeight));
      if (fogVeil) fogVeil.style.opacity = String(p);
      if (overlay) overlay.setScrollProgress(p);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
    return;
  }

  const lenis = new Lenis({ smoothWheel: true, anchors: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  // Pointer parallax (fine pointers) / autonomous drift (touch): lerped
  // toward a target translate each frame via gsap.quickTo, applied to the
  // fog layers only -- the mountain image's own motion now lives entirely in
  // the WebGL overlay's depth-displaced plane (see overlay.js), which is why
  // .mountain no longer gets an x/y tween here. Fog layers counter-translate
  // at a small amplitude for depth; their own `transform` is otherwise
  // untouched by CSS (ambient drift there runs on background-position
  // instead), so this has nothing to fight.
  const fogXTo = gsap.quickTo('.fog-a, .fog-b', 'x', { duration: 1.1, ease: 'power3.out' });
  const fogYTo = gsap.quickTo('.fog-a, .fog-b', 'y', { duration: 1.1, ease: 'power3.out' });

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      fogXTo(-nx * 6);
      fogYTo(-ny * 4);
      // The mountain-stage's own 3D feel now comes from overlay.js's real
      // orbiting perspective camera + vertex-displaced relief mesh (see
      // task-r4-report.md), not a DOM card-tilt -- rotationX/Y quickTo's
      // that used to run here are retired.
      if (overlay) overlay.setPointer(nx, ny);
    });
  } else {
    // Slow autonomous sinusoidal drift on touch/coarse-pointer devices, same
    // amplitude family as the pointer parallax above but time-driven. `t` is
    // gsap.ticker's elapsed time in seconds (matches its use above feeding
    // lenis.raf(t * 1000)). The overlay drives its own autonomous drift for
    // the depth-displaced plane internally (see overlay.js tick()) since it
    // has no pointermove signal to react to on touch devices either.
    gsap.ticker.add((t) => {
      const ampX = Math.sin((t * Math.PI * 2) / 20) * 6;
      const ampY = Math.cos((t * Math.PI * 2) / 26) * 4;
      fogXTo(-ampX * 0.5);
      fogYTo(-ampY * 0.5);
    });
  }

  const loadTl = gsap
    .timeline({ defaults: { ease: 'power4.out' } })
    .from(mountain, { opacity: 0, scale: 1.06, duration: 1.6, ease: 'power2.out' }, 0)
    .from('.hero .line-inner', { yPercent: 115, duration: 1.1, stagger: 0.12 }, 0.15)
    .from(
      ['.nav', '.hero .discover', '.scroll-hint', '.ticker'],
      { opacity: 0, duration: 0.9, stagger: 0.08 },
      0.7
    );

  if (overlay) {
    // Ribbon draws in (uDraw 0 -> 1) alongside the rest of the load-in
    // choreography, same as the old full-scene version, via a proxy object
    // tweened by GSAP and read into the shader uniform on each tick.
    const ribbonProxy = { draw: 0 };
    loadTl.fromTo(
      ribbonProxy,
      { draw: 0 },
      {
        draw: 1,
        duration: 1.8,
        ease: 'power2.out',
        onUpdate: () => overlay.setRibbonDraw(ribbonProxy.draw),
      },
      0.2
    );
  }

  // Single scrub driving the depth-displaced plane's pull-back/zoom (inside
  // the WebGL overlay, via setScrollProgress -> uZoom) and the fog veil
  // together, both keyed off the same 0..1 progress across '.tease' entering
  // the viewport (top bottom -> top top): the veil reaches full opacity at
  // progress ~0.75 rather than at the very end of the range, so About is
  // already clear of the mountain by the time the pull-back settles. The
  // flat yPercent/scale tween that used to run directly on .mountain here is
  // retired -- the canvas now owns all scroll-driven motion on the photo.
  ScrollTrigger.create({
    trigger: '.tease',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      if (fogVeil) fogVeil.style.opacity = String(Math.min(1, p / 0.75));
      if (overlay) overlay.setScrollProgress(p);
    },
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
