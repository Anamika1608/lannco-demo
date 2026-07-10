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
    // Keep the scene's scroll state correct without any animation: mirror the
    // normal path's ScrollTrigger range ('top bottom' -> 'top top' on .tease)
    // with a native passive scroll listener, so the camera pull-back / fog
    // thickening track the user's own scrolling and the About text stays
    // clear of the ribbon. No Lenis, no GSAP, no staggers in this branch.
    const tease = document.querySelector('.tease');
    const updateProgress = () => {
      const rect = tease.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / window.innerHeight));
      api.setScrollProgress(p);
    };
    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress, { passive: true });
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
