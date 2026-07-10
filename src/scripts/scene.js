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
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      ribbonPts.push(
        new THREE.Vector3(
          THREE.MathUtils.lerp(-3, 15, t),
          4.0 + Math.sin(t * Math.PI * 1.8) * 1.6 + t * 1.2,
          -14 + Math.sin(t * Math.PI * 1.2) * 2.2
        )
      );
    }
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
  const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
  scene.add(ribbon);

  // Mist box shifted with the ridge (front-edge delta -14, see ribbon comment
  // above) so the drift sits at the base of the now-farther-away front ridge
  // instead of floating disconnected from it; x/y spread and particle counts
  // are unchanged from the brief.
  const mistCount = isMobile ? 120 : 260;
  const mistPos = new Float32Array(mistCount * 3);
  for (let i = 0; i < mistCount; i++) {
    mistPos[i * 3] = (Math.random() - 0.5) * 50;
    mistPos[i * 3 + 1] = Math.random() * 2.5 - 1.2;
    mistPos[i * 3 + 2] = (Math.random() - 0.5) * 20 - 16;
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
  const mistTexCanvas = document.createElement('canvas');
  mistTexCanvas.width = mistTexCanvas.height = 64;
  const mctx = mistTexCanvas.getContext('2d');
  const grad = mctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,253,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,253,0.55)');
  grad.addColorStop(1, 'rgba(255,255,253,0)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, 0, 64, 64);
  const mist = new THREE.Points(
    mistGeo,
    new THREE.PointsMaterial({
      map: new THREE.CanvasTexture(mistTexCanvas),
      size: 12,
      transparent: true,
      depthWrite: false,
      opacity: 0.85,
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
    mist.rotation.y = t * 0.000012;
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
