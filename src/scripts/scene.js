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
    fogDensity.value = 0.05 + scroll.p * 0.05;
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
