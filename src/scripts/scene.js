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
  uniform float uScrollFade;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    if (vUv.x > uDraw) discard;
    float flow = 0.5 + 0.5 * sin(vUv.x * 22.0 - uTime * 2.2);
    float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    vec3 col = uColor * (0.72 + 0.42 * flow) + fres * 0.3;
    // Brushstroke taper: dissolve the ends over the first/last ~8% of the
    // ribbon's length instead of a hard-edged tube cap. Written with both
    // smoothstep calls in ascending edge order (edge0 < edge1) -- GLSL ES
    // leaves reversed-edge smoothstep (edge0 > edge1) spec-undefined, so the
    // trailing-edge fade is expressed as (1.0 - smoothstep(0.92, 1.0, x))
    // instead of smoothstep(1.0, 0.92, x), which rendered correctly only by
    // driver coincidence.
    float taper = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
    float alpha = (0.5 + 0.5 * flow) * taper * uScrollFade;
    gl_FragColor = vec4(col, alpha);
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

  const fogDensity = { value: 0.05 };
  const isMobile = window.innerWidth < 768;
  const seg = isMobile ? 128 : 256;

  const ridges = [
    { z: -12, seed: 3.1, peak: 10.5, width: 60 },
    { z: -24, seed: 7.7, peak: 6.5, width: 95 },
    { z: -40, seed: 12.4, peak: 4.5, width: 140 },
  ];
  for (const r of ridges) {
    const geo = new THREE.PlaneGeometry(r.width, 22, seg, Math.round(seg / 2));
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

  // Ribbon curve adapted for Task 3's final ridge geometry (see scene.js ridges
  // above), and empirically tuned against real screenshots (its shape can't be
  // derived by inspection alone because the ridge's fbm height field and the
  // camera's perspective frustum both scale non-linearly with position).
  //
  // Two problems drove the final shape, found by reading shots/1440-hero.png
  // and shots/390-hero.png after implementing the brief's literal curve
  // (x -16..13, y 0.9..6.5, z 0.8..5.2 shifted/rescaled for the new geometry):
  //
  // 1. Headline collision: the headline is a narrow left column (CSS
  //    max-width: 12ch), and world x=0 projects to roughly screen-center.
  //    Any curve point with world x below about -3 projected onto the
  //    headline text at 1440px. Fixed by keeping x >= -3 on desktop.
  //
  // 2. Occlusion at 390px (worse than a collision -- the ribbon vanished
  //    entirely): the front ridge's peak-bump is centered at local (0, -2),
  //    i.e. world (0, -14), where the fbm height field + radial peak term
  //    reach roughly y=7-9 (uPeak 10.5 * up to 1.0 fbm factor, plus base
  //    terrain noise, minus the ridge's y=-1.5 offset). At 390's narrow
  //    portrait aspect (390/844 ~= 0.46 vs 1.6 at 1440), the camera's
  //    horizontal frustum at that same z depth is only about +/-5 world
  //    units wide -- i.e. the ONLY part of any curve spanning x -16..13 that
  //    mobile can even see is the x~0 patch directly behind the peak,
  //    literally the tallest point on the mountain. A ribbon at y~4-6 there
  //    (the brief's scaled range) sits below the surface and is depth-tested
  //    away -- invisible, confirmed empirically (390-hero.png showed no red
  //    at all after the first two iterations).
  //
  // Fix: use separate curves per breakpoint instead of one curve reused at
  // both. Desktop keeps a wide sweep across the peak's right shoulder, far
  // enough right (x 6-15) that the terrain height has fallen off from its
  // x=0 maximum, so the ribbon rides visibly above it and tapers off toward
  // the watermark. Mobile uses a shorter, steeper diagonal near screen
  // center but shifted in z away from the peak's z=-14 depth center (toward
  // z=-6, the front-facing shoulder) so the local terrain height there drops
  // to roughly y=4-5 instead of y=7-9, and keeps the ribbon's y around 4.5-6
  // to clear it -- verified visible in shots/390-hero.png after this change.
  //
  // The curve picks by aspect ratio rather than the `isMobile` (<768px)
  // perf flag: at 768x1024 (aspect 0.75, portrait-ish) the desktop curve's
  // frustum math still clips all but a sliver of it (confirmed empirically
  // in shots/768-hero.png), because the frustum width that matters here
  // tracks aspect ratio, not the width breakpoint used to cut render cost.
  //
  // Fix (controller review, this pass): the desktop curve above rode too
  // far right/high (x 6-15, y 4-8) -- above the terrain's falloff instead of
  // on it, so it read as a short thin arc floating in the sky next to the
  // watermark, disconnected from the mountain. Re-shaped (see the formula
  // and its own comment below) to start low/left near the fog line on the
  // mountain's left flank, rise under the summit, drape in a two-fold S
  // across the mid-slope, and exit right into the watermark's screen zone,
  // with z kept in a -5.5..-10 band -- the front ridge's camera-facing near
  // slope -- instead of hugging the peak's z=-14 depth center, so the tube
  // renders against the visible slope face rather than arcing above it in
  // open sky. The x=-3 headline-collision floor documented above was for
  // the *old*, higher/farther curve; the new curve's start (x=-8) tested
  // clear of the headline anyway because it also sits much lower/nearer,
  // off the headline's screen band (see verification below). Radius is
  // desktop-only 0.24 (~1.85x the shared 0.13 this file used previously)
  // -- mobile's radius and curve are untouched because 390-hero.png already
  // reads as bold, draped silk.
  const wideFrustum = window.innerWidth / window.innerHeight >= 1.2;
  const ribbonPts = [];
  if (!wideFrustum) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ribbonPts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(-3.5, 4.5, t),
          5.2 + Math.sin(t * Math.PI * 1.4) * 1.5 - t * 1.4,
          -7 + Math.sin(t * Math.PI) * 1.8
        )
      );
    }
  } else {
    // Round 3's 7 sparse hand-picked control points reintroduced the same
    // Catmull-Rom overshoot as round 1's first attempt: whenever a single
    // control point is simultaneously the sharp turning point for *two*
    // axes at once (there, P2 was both y's local max and z's local min),
    // the spline's tangent through it overshoots into a small hooked loop
    // -- confirmed twice now by rendering and reading the screenshot (a
    // short disconnected red "C" near the summit, apart from the main
    // curve). Densely-sampled continuous formulas (as the original
    // pre-fix code and this file's mobile branch both use) don't have this
    // problem because consecutive samples are close together, so no single
    // point carries a sharp multi-axis reversal.
    //
    // Round 4 (this one) goes back to a formula, sampled at 16 segments,
    // shaped to start low/left near the fog line on the mountain's left
    // flank, rise under the summit, drape down-then-up across the
    // mid-slope (y's two-fold sine), and exit right into the watermark's
    // screen zone -- while keeping z in the -5.5..-10 band established in
    // round 3 as safely clear of both the near-camera foreshortening
    // artifact (round 2's z=-3) and the peak's far z=-14 depth center
    // (the original bug this whole fix addresses).
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      ribbonPts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(-8, 17, t),
          1.6 + Math.sin(t * Math.PI * 2.0) * 2.2 + Math.sin(t * Math.PI) * 0.9,
          -7.5 + Math.sin(t * Math.PI * 1.15) * 2.6 - t * 1.2
        )
      );
    }
  }
  const ribbonRadius = wideFrustum ? 0.24 : 0.13;
  const ribbonGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(ribbonPts),
    isMobile ? 140 : 240,
    ribbonRadius,
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
      uScrollFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  // renderOrder above the mist's default (0): both materials use
  // depthTest: false, so draw order -- not depth -- decides who wins where
  // they overlap. Without this, the mist (added after the ribbon, below)
  // composites over the crimson stroke and hazes it. An explicit
  // renderOrder is used instead of relying on scene.add() call order,
  // because transparent objects at differing distances from the camera can
  // otherwise still get resorted back-to-front by Three's default
  // transparency sort.
  ribbon.renderOrder = 1;
  scene.add(ribbon);

  // Mist band repositioned (controller review, mist-visibility fix): the
  // brief's y -1.2..1.3 / z -26..-6 band sat at the mountain's base, which
  // RIDGE_FRAG shades close to uFogColor there (shade = smoothstep(0,9,vH)
  // is near-zero at low vH) -- i.e. almost exactly CREAM. Combined with the
  // sprite's near-white gradient, the particles had no luminance contrast
  // against *either* the background or the terrain, so they were invisible
  // in stills even though the diagnostic (opaque-red) render proved the
  // particle system itself was rendering and clustering correctly.
  //
  // Fix is structural, not opacity: raise y into the mid-slope band (roughly
  // 1..6, matched to the ribbon's own y 1.6..6.5 band above, which is
  // already verified to sit visibly on the gray mountain body rather than
  // floating above it) so wisps overlap the ridge-gray zone where shade is
  // meaningfully mixed toward uInk, not the pale near-fog base. z is pulled
  // forward from -26..-6 to -15..-3 (same front-ridge z-span the ribbon
  // occupies) to keep particles in front of the terrain's near face instead
  // of behind it.
  //
  // x also changed from a flat -25..25 uniform spread to a center-weighted
  // (triangular) distribution over the same -25..25 extent: the mobile/
  // narrow-frustum camera only sees roughly +/-4 world units at this depth
  // (the same frustum-narrowing documented in the ribbon comment above), so
  // a uniform spread put ~85% of mist particles off-screen on mobile --
  // confirmed empirically, 390-hero.png showed no haze at all with a flat
  // spread even after the y/z repositioning above. The triangular spread
  // keeps the same outer extent (still populates the wide desktop slope,
  // where the ribbon's own x -8..17 band lives) while roughly doubling
  // particle density near x=0, so mobile's narrow visible window still
  // catches a visible cluster.
  //
  // Reshaped from speckle into billows (controller review, billow fix):
  // the earlier 120/260 small wisp-sprites read in a static hero still as
  // dozens of discrete soft DOTS -- bokeh/snow speckle -- sprinkled across
  // the mountain body, not drifting atmosphere. Rebuilt as a few broad
  // overlapping fog patches instead: count cut to 15/24 (mobile/desktop,
  // keeping the mobile-reduction pattern), each sprite scaled to a large
  // soft veil patch (see `size` on the material below) at whisper opacity,
  // so mist only registers where several patches overlap into a billowing
  // mass. The band is also lowered from y 1..6 (mid-slope, competing with
  // the mountain body and the ribbon's y 1.6..6.5 draped path) to roughly
  // y 0.4..2.4 -- the base/fog line and lower flanks where mist naturally
  // pools -- keeping the billows off the ribbon's arc so the stroke stays
  // clean.
  //
  // Placement is cluster-based rather than a free random scatter: a free
  // draw of only ~24 whisper-opacity sprites cannot guarantee the
  // several-sprite overlaps the effect needs to register (verified
  // empirically -- a free low-band scatter at these magnitudes was only
  // perceptible under contrast stretching). Sprites are jittered around
  // three fixed low-flank centers -- left flank, center (inside the
  // ~+/-4-unit window mobile's narrow frustum can see, per the frustum
  // note above), and right flank under the watermark -- so each cluster
  // reliably accumulates into one soft fog mass, while the triangular
  // jitter keeps the masses organic rather than circular.
  const mistClusters = [
    { x: -9, y: 1.1, z: -6 },
    { x: 1.5, y: 1.0, z: -8 },
    { x: 11, y: 1.4, z: -10 },
  ];
  const mistCount = isMobile ? 15 : 24;
  const mistPos = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    const c = mistClusters[i % mistClusters.length];
    mistPos[i * 3] = c.x + (Math.random() + Math.random() - 1) * 3.5;
    mistPos[i * 3 + 1] = c.y + (Math.random() - 0.5) * 1.2;
    mistPos[i * 3 + 2] = c.z + (Math.random() - 0.5) * 3;
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistTexCanvas = document.createElement('canvas');
  mistTexCanvas.width = mistTexCanvas.height = 64;
  const mctx = mistTexCanvas.getContext('2d');
  // Tinted a faint warm gray -- lighter than the mid-slope's ink-mixed gray
  // (~rgb(173,171,166) at the ribbon's y-band) but noticeably darker/warmer
  // than CREAM (242,239,233) -- so the same sprite reads as a bright wisp
  // against the dark mountain body and a soft muted smudge against the
  // cream sky, instead of vanishing into one or the other.
  //
  // Falloff softened (billow fix): alpha now starts at a modest 0.4 and
  // reaches fully transparent by the 0.55-radius stop, leaving the outer
  // ~45% of the sprite completely clear -- no circular edge is perceivable
  // at any overlap, which is what let the old harder-edged gradient
  // (0.9 center, still 0.55 alpha at 0.6 radius) read as distinct dots.
  const grad = mctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(222,213,198,0.4)');
  grad.addColorStop(0.3, 'rgba(222,213,198,0.2)');
  grad.addColorStop(0.55, 'rgba(222,213,198,0)');
  grad.addColorStop(1, 'rgba(222,213,198,0)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, 64, 64);
  // depthTest: false -- the mid-slope y-band above sits inside the front
  // ridge's own z-extent, and near x=0 (behind the peak's radial bump) the
  // opaque terrain surface reaches y~9, taller than the mist band's y<=6.
  // Depth-testing against that surface culled almost every particle in
  // exactly the x~0 column mobile's narrow frustum can see (confirmed: the
  // y/z reposition alone fixed 1440-hero's haze but left 390-hero with
  // none), so mist is drawn as a front atmospheric layer that always wins,
  // consistent with "drifting mist" reading as a layer in front of the
  // mountain rather than a set of objects embedded in its geometry.
  //
  // size/opacity retuned (controller review, whiteout fix): the position
  // move above (z from -26..-6 to -15..-3, i.e. much nearer the camera at
  // z~15) kept the old far-placement magnitudes -- size 12, opacity 0.85 --
  // which were never re-tuned for the shorter camera distance. With
  // sizeAttenuation (PointsMaterial's default), `size` is a world-unit
  // sprite diameter whose *screen* size grows as the particle nears the
  // camera; at ~18-30 world units out (this band's actual range) a 12-unit
  // sprite covers roughly 85% of the viewport's height, and 120-260 of them
  // at opacity 0.85 with depthTest: false accumulate into a near-opaque
  // cream veil -- confirmed empirically: the mid-slope sampled at
  // rgb(240,235,228), i.e. essentially CREAM, at 1440/768/390 alike, with
  // the gray mountain body and the ribbon draped on it no longer visible
  // through it.
  //
  // Magnitudes (billow fix, superseding the earlier size 2.2/opacity 0.22
  // whiteout retune, which fixed the veil but left the mist reading as
  // speckle): size 7 world units -- each sprite is a broad soft fog
  // patch at this ~18-30 unit camera distance, not an individual dot --
  // at opacity 0.12, faint enough that a lone patch barely registers and
  // the visible billows are the several-patch overlaps each cluster
  // guarantees along the base/fog line (see the cluster comment above).
  // The ribbon draws above this layer regardless (ribbon.renderOrder = 1),
  // so the crimson stroke stays crisp. Re-verified against fresh renders
  // at 390/768/1440: no individually distinguishable circles, soft fog
  // masses perceptible against the lower slope, mountain body and ribbon
  // untouched by haze.
  const mist = new THREE.Points(
    mistGeo,
    new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(mistTexCanvas),
      size: 7,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      opacity: 0.12,
    })
  );
  scene.add(mist);

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
  function setRibbonDraw(v) {
    ribbonMat.uniforms.uDraw.value = v;
  }

  function tick(t) {
    const drift = pointer.active ? 0 : 1;
    const tx = pointer.x * 2.4 + drift * Math.sin(t * 0.00022) * 1.7;
    const ty = -pointer.y * 1.1 + drift * Math.cos(t * 0.00017) * 0.6;
    camera.position.x += (tx - camera.position.x) * 0.045;
    camera.position.y +=
      (CAM_BASE.y + ty - scroll.p * 5.5 - camera.position.y) * 0.055;
    camera.position.z = CAM_BASE.z + scroll.p * 5;
    fogDensity.value = 0.05 + scroll.p * 0.05;
    camera.lookAt(0, 4 - scroll.p * 2.5, 0);
    ribbonMat.uniforms.uTime.value = t * 0.001;
    // Brand-stroke dissolve: the ribbon is fully present through the hero
    // (scroll.p == 0) and fades out as the About tease section scrolls in,
    // fully gone before the About text is centered (scroll.p >= 0.85). This
    // is the fix for the ribbon crossing straight through the About heading
    // at 390px, where camera pullback alone can't clear it -- see
    // shots/390-tease.png.
    ribbonMat.uniforms.uScrollFade.value =
      1.0 - THREE.MathUtils.smoothstep(scroll.p, 0.35, 0.85);
    // Bounded oscillation, not monotonic drift: unbounded rotation would sweep
    // the outer mist clusters' depthTest:false sprites through the camera
    // plane over several minutes, compositing into a near-opaque cream veil.
    mist.rotation.y = Math.sin(t * 0.00006) * 0.05;
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
