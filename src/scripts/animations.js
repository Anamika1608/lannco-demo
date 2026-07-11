import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export function boot() {
  const mountain = document.querySelector('.mountain');
  const fogVeil = document.querySelector('.fog-veil');

  // "Our story" has no destination in this demo -- href="#" is kept as a
  // visual CTA but must not natively jump the page to top. Install this on
  // both the reduced-motion and normal paths, before the early return.
  const teaseDiscover = document.querySelector('.tease .discover');
  if (teaseDiscover) {
    teaseDiscover.addEventListener('click', (e) => e.preventDefault());
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
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
  // toward a target translate each frame via gsap.quickTo, applied directly
  // to .mountain's x/y. GSAP composites x/y/scale tweens on the same target
  // into one `transform` internally, so this doesn't fight the load-in/
  // scroll scale tweens on the same element (also GSAP-driven, below). Fog
  // layers counter-translate at a smaller amplitude for depth; their own
  // `transform` is otherwise untouched by CSS (ambient drift there runs on
  // background-position instead), so this has nothing to fight either.
  const mountainXTo = gsap.quickTo(mountain, 'x', { duration: 0.9, ease: 'power3.out' });
  const mountainYTo = gsap.quickTo(mountain, 'y', { duration: 0.9, ease: 'power3.out' });
  const fogXTo = gsap.quickTo('.fog-a, .fog-b', 'x', { duration: 1.1, ease: 'power3.out' });
  const fogYTo = gsap.quickTo('.fog-a, .fog-b', 'y', { duration: 1.1, ease: 'power3.out' });

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (finePointer) {
    window.addEventListener('pointermove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      mountainXTo(nx * 12);
      mountainYTo(ny * 8);
      fogXTo(-nx * 6);
      fogYTo(-ny * 4);
    });
  } else {
    // Slow autonomous sinusoidal drift on touch/coarse-pointer devices, same
    // amplitude family as the pointer parallax above but time-driven. `t` is
    // gsap.ticker's elapsed time in seconds (matches its use above feeding
    // lenis.raf(t * 1000)).
    gsap.ticker.add((t) => {
      const ampX = Math.sin((t * Math.PI * 2) / 20) * 6;
      const ampY = Math.cos((t * Math.PI * 2) / 26) * 4;
      mountainXTo(ampX);
      mountainYTo(ampY);
      fogXTo(-ampX * 0.5);
      fogYTo(-ampY * 0.5);
    });
  }

  gsap
    .timeline({ defaults: { ease: 'power4.out' } })
    .from(mountain, { opacity: 0, scale: 1.06, duration: 1.6, ease: 'power2.out' }, 0)
    .from('.hero .line-inner', { yPercent: 115, duration: 1.1, stagger: 0.12 }, 0.15)
    .from(
      ['.nav', '.hero .discover', '.scroll-hint', '.ticker'],
      { opacity: 0, duration: 0.9, stagger: 0.08 },
      0.7
    );

  // Single scrub driving the mountain pull-back/settle and the fog veil
  // together, both keyed off the same 0..1 progress across '.tease' entering
  // the viewport (top bottom -> top top): the veil reaches full opacity at
  // progress ~0.75 rather than at the very end of the range, so About is
  // already clear of the mountain by the time the pull-back settles.
  ScrollTrigger.create({
    trigger: '.tease',
    start: 'top bottom',
    end: 'top top',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress;
      gsap.set(mountain, { yPercent: -12 * p, scale: 1 - 0.03 * p });
      if (fogVeil) fogVeil.style.opacity = String(Math.min(1, p / 0.75));
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
