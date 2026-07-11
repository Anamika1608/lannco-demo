import * as THREE from 'three';

// Overlay scene: the hero photo itself, rendered as a TRUE 3D relief mesh
// (public/mountain-depth.jpg drives real per-vertex Z displacement on a
// dense PlaneGeometry -- not a flat UV shift on a camera-bypassing quad)
// viewed through an orbiting perspective camera. Pointer/autonomous
// yaw+pitch swing the camera around the mesh, so the rock's screen
// silhouette and its apex-to-edge profile genuinely change shape -- real
// perspective, not texture-sliding. setRibbonDraw stays a no-op (the
// crimson ribbon was retired at client direction, 2026-07-11) and the mist
// Points layer (client: "no clouds") was removed in this round -- see
// task-r4-report.md for the full before/after.

const RELIEF_VERT = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D uDepth;
  uniform float uRelief;
  uniform vec2 uRepeat;
  uniform vec2 uOffset;

  void main() {
    // uRepeat/uOffset bake the cover-fit + object-position crop (computed
    // once in JS -- see coverFit() below, ported from the previous round's
    // verified fragment-shader math) into a single multiply-add, so plain
    // geometry uv plus this transform lands exactly on the same crop the
    // fallback <img>'s CSS object-fit/object-position produces.
    vec2 mapUv = uv * uRepeat + uOffset;
    vUv = mapUv;
    vec3 pos = position;
    // Vertex texture fetch (VTF): standard GLSL, no #include needed -- any
    // GPU three.js 0.182 targets supports sampling a texture in the vertex
    // stage. The depth map's red channel (mask-boosted, heavily blurred --
    // see public/mountain-depth.jpg) pushes the rock toward the camera
    // while sky/fog stay near the flat base plane, so orbiting the camera
    // actually changes the rock's silhouette instead of sliding a flat
    // texture across a card.
    float d = texture2D(uDepth, mapUv).r;
    pos.z += d * uRelief;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const RELIEF_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMap;

  void main() {
    // NoColorSpace on purpose: ShaderMaterial does not append three's
    // output-colorspace re-encode, so an SRGB-decoded (linear) sample
    // would ship linear to the canvas and render visibly darker. With no
    // decode the raw sRGB bytes pass straight through -- pixel-identical
    // to the <img> fallback.
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
  }
`;

const FOV = 42;
const FOV_RAD = (FOV * Math.PI) / 180;
// Orbit-around-a-coplanar-pivot geometry means motion parallax scales with
// (relief displacement / CAM_DISTANCE), not with yaw angle alone -- an
// initial 14 (matching the old fixed camera's z) measured only ~10px of
// silhouette shift at full ±8 deg yaw (see task-r4-report.md's FPS/silhouette
// section), well under the required >25px. Pulled in to 8 empirically
// (measured via .superpowers/sdd/r4-3d-proof.mjs) for a strong, unmistakable
// ~70-90px shift while OVERSCAN below still fully covers the frustum at
// extremes (verified corner shots, no cream gaps).
const CAM_DISTANCE = 8;
// Extra plane size beyond the exact cover-fit frustum, so orbit rotation
// (yaw/pitch swing + breathing) and scroll recede never reveal cream edges
// past the mesh's boundary.
const OVERSCAN = 0.08;
// CSS-style (top-down) object-position fraction, matching the fallback
// <img>'s object-position: 43% 38% exactly -- static composition must stay
// identical to the pre-existing approved framing.
const ANCHOR = { x: 0.43, y: 0.38 };

export function initOverlay(canvas, fallbackImg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();

  function boxSize() {
    const rect = canvas.getBoundingClientRect();
    return {
      w: Math.max(1, Math.round(rect.width)),
      h: Math.max(1, Math.round(rect.height)),
    };
  }

  let { w, h } = boxSize();
  renderer.setSize(w, h, false);

  const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.1, 200);

  let imageAspect = 1.5; // 2400x1600 source; refined once the texture loads
  let isMobile = window.innerWidth < 768;

  // Cover-fit (CSS object-fit: cover + object-position) baked into the
  // texture's own offset/repeat, computed once (and on resize/texture
  // load) instead of per-pixel in the old fragment-only branch. Ported
  // directly from the previous round's verified-correct coverUV() math
  // (see task-r3-report.md) -- same excess/offset/scale derivation, just
  // hoisted out of the shader into a single JS calculation.
  function coverFit() {
    const Av = w / h;
    const Ai = imageAspect;
    const s = Math.max(Av / Ai, 1);
    const scaledW = Ai * s;
    const scaledH = s;
    const excessX = scaledW - Av;
    const excessY = scaledH - 1;
    const offsetX = excessX * ANCHOR.x;
    const offsetY = excessY * ANCHOR.y;
    const repeatX = Av / scaledW;
    const repeatY = 1 / scaledH;
    const offX = offsetX / scaledW;
    const offY = 1 - (offsetY + 1) / scaledH;
    return { repeatX, repeatY, offX, offY };
  }

  function visibleSize(distance) {
    const visH = 2 * distance * Math.tan(FOV_RAD / 2);
    const visW = visH * (w / h);
    return { visW, visH };
  }

  const reliefMat = new THREE.ShaderMaterial({
    vertexShader: RELIEF_VERT,
    fragmentShader: RELIEF_FRAG,
    uniforms: {
      uMap: { value: null },
      uDepth: { value: null },
      uRelief: { value: isMobile ? 2.5 : 3.5 },
      uRepeat: { value: new THREE.Vector2(1, 1) },
      uOffset: { value: new THREE.Vector2(0, 0) },
    },
  });

  // Dense relief mesh: PlaneGeometry facing the camera at z=0, sized in JS
  // to cover-fit the viewport exactly at CAM_DISTANCE (plus OVERSCAN), then
  // vertex-displaced by the depth map. 300x200 segments desktop -- if the
  // FPS check ever comes in under target on a real device, drop to 200x133
  // here first (see task-r4-report.md's FPS section).
  const SEG_X = 300;
  const SEG_Y = 200;
  let plane = null;

  function rebuildPlane() {
    const { visW, visH } = visibleSize(CAM_DISTANCE);
    const pw = visW * (1 + OVERSCAN);
    const ph = visH * (1 + OVERSCAN);
    const geo = new THREE.PlaneGeometry(pw, ph, SEG_X, SEG_Y);
    if (plane) {
      plane.geometry.dispose();
      plane.geometry = geo;
    } else {
      plane = new THREE.Mesh(geo, reliefMat);
      scene.add(plane);
    }
  }
  rebuildPlane();

  function updateCoverFit() {
    const { repeatX, repeatY, offX, offY } = coverFit();
    reliefMat.uniforms.uRepeat.value.set(repeatX, repeatY);
    reliefMat.uniforms.uOffset.value.set(offX, offY);
  }
  updateCoverFit();

  // Relief mesh: textures loaded from the fallback <img>'s already-resolved
  // src (respects Astro's BASE_URL without this module needing to know it)
  // and the sibling depth map file.
  let planeReady = false;
  let planeRevealed = false;

  if (fallbackImg && fallbackImg.src) {
    const loader = new THREE.TextureLoader();
    const depthSrc = fallbackImg.src.replace(/mountain\.jpg(\?.*)?$/, 'mountain-depth.jpg$1');
    let loadedCount = 0;
    const onOneLoaded = () => {
      loadedCount++;
      if (loadedCount >= 2) planeReady = true;
    };
    loader.load(
      fallbackImg.src,
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        if (tex.image && tex.image.width && tex.image.height) {
          imageAspect = tex.image.width / tex.image.height;
          updateCoverFit();
        }
        reliefMat.uniforms.uMap.value = tex;
        onOneLoaded();
      },
      undefined,
      () => {
        /* load failure: never mark ready -- fallback <img> stays visible */
      }
    );
    loader.load(
      depthSrc,
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        reliefMat.uniforms.uDepth.value = tex;
        onOneLoaded();
      },
      undefined,
      () => {
        /* load failure: never mark ready -- fallback <img> stays visible */
      }
    );
  }

  const pointer = { x: 0, y: 0, active: false };
  const scroll = { p: 0 };
  let reduced = false;

  // Orbit rig: pointer x/y map to yaw/pitch targets, lerped each tick
  // (same lerp feel as the old camera code); coarse pointers (no
  // pointermove signal) get a slow autonomous orbit instead; a constant
  // low-amplitude breathing micro-orbit keeps the diorama alive even at
  // rest with the pointer parked. Real camera perspective (not UV
  // displacement) is what sells the "diorama" feel on hover.
  const YAW_MAX = (8 * Math.PI) / 180;
  const PITCH_MAX = (5 * Math.PI) / 180;
  const BREATHE_YAW = (0.6 * Math.PI) / 180;
  const BREATHE_PITCH = (0.6 * Math.PI) / 180;
  const ORBIT_LERP = 0.045;
  const AUTO_AMPLITUDE = 0.4; // autonomous orbit amplitude vs. full pointer deflection
  const AUTO_PERIOD_MS = 20000;
  // Scroll recede: camera pulls back slightly (true 3D zoom-out, not a UV
  // trick) -- kept modest relative to OVERSCAN so the recede never outgrows
  // the mesh's safety margin.
  const RECEDE = CAM_DISTANCE * 0.06;

  let yawCurrent = 0;
  let pitchCurrent = 0;

  function setPointer(nx, ny) {
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }
  function setScrollProgress(p) {
    scroll.p = p;
  }
  function setRibbonDraw() {
    /* ribbon removed at client direction -- kept for contract stability */
  }
  function setReducedMotion(flag) {
    reduced = flag;
  }

  function tick(t) {
    // Reduced-motion contract: yaw/pitch locked at 0, no breathing, no
    // scroll recede -- a fully static frame, same discipline as the rest of
    // this file's motion under prefers-reduced-motion.
    let yawTarget = 0;
    let pitchTarget = 0;
    if (!reduced) {
      if (pointer.active) {
        yawTarget = pointer.x * YAW_MAX;
        pitchTarget = -pointer.y * PITCH_MAX;
      } else {
        yawTarget = Math.sin((t * 2 * Math.PI) / AUTO_PERIOD_MS) * YAW_MAX * AUTO_AMPLITUDE;
        pitchTarget =
          Math.cos((t * 2 * Math.PI) / (AUTO_PERIOD_MS * 1.3)) * PITCH_MAX * AUTO_AMPLITUDE;
      }
    }
    yawCurrent += (yawTarget - yawCurrent) * ORBIT_LERP;
    pitchCurrent += (pitchTarget - pitchCurrent) * ORBIT_LERP;

    const breatheYaw = reduced ? 0 : Math.sin(t * 0.00018) * BREATHE_YAW;
    const breathePitch = reduced ? 0 : Math.cos(t * 0.00015) * BREATHE_PITCH;
    const yaw = yawCurrent + breatheYaw;
    const pitch = pitchCurrent + breathePitch;

    const dist = reduced ? CAM_DISTANCE : CAM_DISTANCE + scroll.p * RECEDE;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist
    );
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    // Reveal only after a real frame has painted with both textures bound --
    // never a blank flash, and the <img> fallback stays visible for good
    // until this fires (or forever, if a texture failed to load).
    if (planeReady && !planeRevealed) {
      planeRevealed = true;
      // A CSS class (not a direct style write) -- the load-in timeline's
      // opacity tween on this same element writes its inline style every
      // frame for ~1.75s and would otherwise silently clobber a plain
      // `style.opacity = '0'` set here. See the .is-plane-ready rule.
      if (fallbackImg) fallbackImg.classList.add('is-plane-ready');
    }
  }
  renderer.setAnimationLoop(tick);

  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : tick);
  });

  window.addEventListener('resize', () => {
    const size = boxSize();
    w = size.w;
    h = size.h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    isMobile = window.innerWidth < 768;
    reliefMat.uniforms.uRelief.value = isMobile ? 2.5 : 3.5;
    rebuildPlane();
    updateCoverFit();
  });

  return { setPointer, setScrollProgress, setRibbonDraw, setReducedMotion };
}
