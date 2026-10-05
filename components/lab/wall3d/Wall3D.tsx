'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ArrowCounterClockwise, Check } from '@phosphor-icons/react';
import { tx, type Lang, type Mode } from '../../../lib/lab/model';
import { makeTags, mySpot, SPRAY, VEHICLES } from '../graffitiArt';
import { LIMITS, loadDrawing, paintLeft, PAINT, strokeCost, uploadDrawing, type Stroke } from '../graffitiStore';
import { C, EASE, MODE_COLOR, TYPE } from '../theme';
import { paintBody, paintGlow, paintStroke, paintTag, STAGE } from './paint';
import Graffiti from '../Graffiti';

// The wall, in 3D. A journey with a beginning and an end:
//   run    — the vehicle is moving, seen at an angle, everyone's marks on it
//   brake  — "我受影响了" stops it; it decelerates and the camera swings square
//   parked — you hold a can with a visible liquid level and spray the body
//   depart — "完成": the camera swings back and it pulls away with your mark
//   run    — and keeps running, your mark included; "继续喷" stops it again
// Everything on the body is one canvas texture; strokes are stored in the
// same 360×150 stage units as before.

type Phase = 'run' | 'brake' | 'parked' | 'depart';
export type WallLink = { anticipate: (on: boolean) => void };
type Doodle = { count: number; loaded: boolean; marked: boolean; spraying: boolean };

const S = 0.025; // stage unit → world unit
const TEX = 4; // texture pixels per stage unit
const SIZES = [4, 8, 14];
const UNIT: Record<Mode, [string, string]> = { TRAIN: ['列火车', 'train'], SUBWAY: ['节地铁', 'metro car'], BUS: ['辆公交', 'bus'], AIRPORT: ['架飞机', 'plane'] };

export default function Wall3D({ mode, seed, storeKey, doodle, lang, open, onOpen, onClose, onLink, onHint, footer }: {
  mode: Mode; seed: string; storeKey: string; doodle: Doodle; lang: Lang; open: boolean; onOpen: () => void; onClose: () => void;
  onLink?: (link: WallLink | null) => void; onHint?: () => void; footer?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const color = MODE_COLOR[mode];
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>('run');
  const [saved, setSaved] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke[] | null>(null);
  const [brush, setBrush] = useState({ c: color.main, w: SIZES[1] });
  const [empty, setEmpty] = useState(false);
  const [saving, setSaving] = useState(false);
  const drawing = phase === 'parked';
  const strokes = drawing ? draft ?? saved : saved;
  const left = paintLeft(strokes);
  const others = Math.max(doodle.count - (doodle.marked ? 1 : 0), 0);
  const tags = useMemo(() => makeTags(mode, seed, others), [mode, seed, others]);
  const spot = useMemo(() => mySpot(mode, seed), [mode, seed]);

  // Bridges between React and the render loop.
  const api = useRef<{ redraw: (s: Stroke[]) => void; setPhase: (p: Phase) => void; setLevel: (l: number, c: string) => void } | null>(null);
  const live = useRef({ strokes, brush, left, drawing, onChange: (s: Stroke[]) => setDraft(s), onEmpty: () => {} });
  const paintState = useRef({ tags, mine: doodle.marked, spot, mode, accent: color.main });
  const phaseRef = useRef<Phase>('run');
  const hintRef = useRef({ onHint, onLink, marked: doodle.marked });
  useLayoutEffect(() => {
    phaseRef.current = phase;
    hintRef.current = { onHint, onLink, marked: doodle.marked };
    live.current = { strokes, brush, left, drawing, onChange: s => setDraft(s), onEmpty: () => { setEmpty(true); setTimeout(() => setEmpty(false), 1600); } };
    paintState.current = { tags, mine: doodle.marked, spot, mode, accent: color.main };
  });

  useEffect(() => { const t = setTimeout(() => setSaved(loadDrawing(storeKey) ?? []), 0); return () => clearTimeout(t); }, [storeKey]);

  // The journey: pressing the button (or "继续喷") stops the vehicle.
  useEffect(() => {
    if (open && doodle.marked && phase === 'run') { const t = setTimeout(() => setPhase('brake'), 0); return () => clearTimeout(t); }
  }, [open, doodle.marked, phase]);
  useEffect(() => { api.current?.setPhase(phase); }, [phase]);
  useEffect(() => { api.current?.redraw(strokes); }, [strokes, tags, doodle.marked]);
  useEffect(() => { api.current?.setLevel(left / PAINT, drawing ? brush.c : color.main); }, [left, brush.c, drawing, color.main]);

  const finish = async () => {
    if (draft) {
      setSaving(true);
      await uploadDrawing(storeKey, draft);
      setSaved(draft);
      setDraft(null);
      setSaving(false);
    }
    onClose();
    setPhase('depart');
  };

  // ── Scene ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      const t = setTimeout(() => setFailed(true), 0);
      return () => clearTimeout(t);
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'pan-y';
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Reflections; optional (older GPUs without float targets simply skip them).
    let env: THREE.Texture | null = null;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;
      pmrem.dispose();
    } catch { /* flat lighting still works */ }

    const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
    const disposables: { dispose: () => void }[] = env ? [env] : [];
    const own = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x; };

    // Light: soft sky, a warm key, a rim in the mode's colour.
    scene.add(new THREE.HemisphereLight('#B8C6E6', '#0B0C0E', 0.45));
    const key = new THREE.DirectionalLight('#E8EEFF', 1.15);
    key.position.set(5, 8, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(new THREE.Color(MODE_COLOR[mode].main), 1.6);
    rim.position.set(-7, 3, -6);
    scene.add(rim);

    // ── Vehicle body: the side profile, extruded and bevelled ──
    const plane = mode === 'AIRPORT';
    // SVG's y points down; the transform flips it to world up before extruding.
    const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path transform="matrix(1 0 0 -1 0 ${STAGE.h})" d="${VEHICLES[mode].body}"/></svg>`);
    const shapes = svg.paths.flatMap(p => SVGLoader.createShapes(p));
    const depth = plane ? 14 : 92;
    const bevel = plane ? { bevelThickness: 18, bevelSize: 15, bevelSegments: 8 } : { bevelThickness: 7, bevelSize: 5, bevelSegments: 5 };
    const fuselage = shapes.slice(0, 1);
    const extras = shapes.slice(1);
    const makeBody = (list: THREE.Shape[], d: number, b: typeof bevel) => {
      const g = own(new THREE.ExtrudeGeometry(list, { depth: d, curveSegments: 28, bevelEnabled: true, ...b }));
      // Side faces (caps) get UVs that map the 360×150 stage onto them.
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / STAGE.w, pos.getY(i) / STAGE.h);
      g.translate(-STAGE.w / 2, 0, -d / 2);
      g.scale(S, S, S);
      return g;
    };

    const texCanvas = document.createElement('canvas');
    texCanvas.width = STAGE.w * TEX;
    texCanvas.height = STAGE.h * TEX;
    const tctx = texCanvas.getContext('2d')!;
    const base = document.createElement('canvas');
    base.width = texCanvas.width;
    base.height = texCanvas.height;
    const bctx = base.getContext('2d')!;
    bctx.scale(TEX, TEX);
    paintBody(bctx, mode, MODE_COLOR[mode].main);
    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = texCanvas.width;
    glowCanvas.height = texCanvas.height;
    const gctx = glowCanvas.getContext('2d')!;
    const glowBase = document.createElement('canvas');
    glowBase.width = texCanvas.width;
    glowBase.height = texCanvas.height;
    const gbctx = glowBase.getContext('2d')!;
    gbctx.scale(TEX, TEX);
    paintGlow(gbctx, mode, MODE_COLOR[mode].main);
    const glowTexture = own(new THREE.CanvasTexture(glowCanvas));
    glowTexture.colorSpace = THREE.SRGBColorSpace;
    const texture = own(new THREE.CanvasTexture(texCanvas));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const sideMat = own(new THREE.MeshPhysicalMaterial({ map: texture, emissiveMap: glowTexture, emissive: new THREE.Color('#FFFFFF'), emissiveIntensity: 0.85, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.12 }));
    const shellMat = own(new THREE.MeshPhysicalMaterial({ color: '#2B2F37', roughness: 0.32, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.15 }));
    const darkMat = own(new THREE.MeshStandardMaterial({ color: '#16181C', roughness: 0.7, metalness: 0.4 }));
    const metalMat = own(new THREE.MeshStandardMaterial({ color: '#8C929B', roughness: 0.3, metalness: 0.9 }));

    const vehicle = new THREE.Group();
    scene.add(vehicle);
    const body = new THREE.Mesh(makeBody(fuselage, depth, bevel), [sideMat, shellMat]);
    vehicle.add(body);
    if (extras.length) vehicle.add(new THREE.Mesh(makeBody(extras, 3, { bevelThickness: 2, bevelSize: 2, bevelSegments: 3 }), [sideMat, shellMat]));

    // Running gear
    const wheels: THREE.Object3D[] = [];
    const wheelAt = (x: number, y: number, r: number, z: number) => {
      const w = new THREE.Group();
      const tyre = new THREE.Mesh(own(new THREE.CylinderGeometry(r, r, 0.16, 28)), darkMat);
      tyre.rotation.x = Math.PI / 2;
      const hub = new THREE.Mesh(own(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.18, 6)), metalMat);
      hub.rotation.x = Math.PI / 2;
      w.add(tyre, hub);
      w.position.set((x - STAGE.w / 2) * S, (STAGE.h - y) * S, z);
      vehicle.add(w);
      wheels.push(w);
    };
    const halfW = (depth / 2) * S;
    if (mode === 'TRAIN' || mode === 'SUBWAY') {
      (mode === 'TRAIN' ? [46, 76, 262, 292] : [50, 80, 280, 310]).forEach(x => [1, -1].forEach(z => wheelAt(x, 122, 8 * S, z * (halfW - 0.1))));
      const under = new THREE.Mesh(own(new THREE.BoxGeometry(312 * S, 4 * S, depth * S * 0.8)), darkMat);
      under.position.set(0, (STAGE.h - 118) * S, 0);
      vehicle.add(under);
    } else if (mode === 'BUS') {
      [76, 290].forEach(x => [1, -1].forEach(z => wheelAt(x, 114, 14 * S, z * (halfW - 0.05))));
    } else {
      // Wings and an engine for the plane
      const wingShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(2.1, 0), new THREE.Vector2(1.0, 3.1), new THREE.Vector2(0.55, 3.1)]);
      const wingGeo = own(new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }));
      wingGeo.rotateX(Math.PI / 2);
      [1, -1].forEach(z => {
        const wing = new THREE.Mesh(wingGeo, shellMat);
        wing.position.set(-0.6, (STAGE.h - 92) * S, 0);
        wing.scale.set(1, 1, z);
        vehicle.add(wing);
        const engine = new THREE.Mesh(own(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 24)), metalMat);
        engine.rotation.z = Math.PI / 2;
        engine.position.set(0.1, (STAGE.h - 100) * S, z * 1.25);
        vehicle.add(engine);
      });
    }
    // Platform edge with the yellow safety line, for rail
    if (mode === 'TRAIN' || mode === 'SUBWAY') {
      const edge = new THREE.Mesh(own(new THREE.BoxGeometry(80, 0.05, 0.06)), own(new THREE.MeshStandardMaterial({ color: '#E8C547', emissive: new THREE.Color('#5A4A10'), roughness: 0.6 })));
      edge.position.set(0, (STAGE.h - 131) * S + 0.03, (depth / 2) * S + 1.25);
      scene.add(edge);
    }
    // Cabin light spilling onto the floor beside the vehicle
    const spillTex = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(128, 0, 4, 128, 0, 150);
      g.addColorStop(0, 'rgba(255,200,130,0.55)');
      g.addColorStop(1, 'rgba(255,200,130,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 64);
      return own(new THREE.CanvasTexture(c));
    })();
    if (!plane) {
      const spill = new THREE.Mesh(own(new THREE.PlaneGeometry(10, 2.4)), own(new THREE.MeshBasicMaterial({ map: spillTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
      spill.rotation.x = -Math.PI / 2;
      spill.position.set(0, (STAGE.h - (mode === 'BUS' ? 129 : 131)) * S + 0.02, (depth / 2) * S + 1.15);
      scene.add(spill);
    }

    const dotTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      return own(new THREE.CanvasTexture(c));
    })();
    // Headlights
    const lampMat = own(new THREE.MeshStandardMaterial({ color: '#FFFFFF', emissive: new THREE.Color('#FFF3D6'), emissiveIntensity: 2 }));
    if (!plane) [1, -1].forEach(z => {
      const lamp = new THREE.Mesh(own(new THREE.SphereGeometry(0.06, 12, 12)), lampMat);
      lamp.position.set((mode === 'TRAIN' ? 348 : 351) * S - STAGE.w / 2 * S, (STAGE.h - 104) * S, z * (halfW - 0.3));
      vehicle.add(lamp);
      const halo = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: dotTex, color: '#FFE7BF', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
      halo.scale.setScalar(0.9);
      halo.position.copy(lamp.position);
      vehicle.add(halo);
    });

    // A wet-floor reflection: the same vehicle, mirrored under a translucent
    // floor. Clones share geometry and materials, so it costs one draw each.
    const mirror = plane ? null : vehicle.clone();
    if (mirror) { mirror.scale.y = -1; scene.add(mirror); }
    const mirrorWheels: THREE.Object3D[] = [];
    mirror?.traverse(o => { if (o.type === 'Group' && o !== mirror) mirrorWheels.push(o); });

    // ── Ground: track or road, moving under the vehicle ──
    const ground = new THREE.Group();
    scene.add(ground);
    const groundY = plane ? -1 : (STAGE.h - (mode === 'BUS' ? 129 : 131)) * S;
    // The floor fades out at its edges so it melts into the card behind.
    const fade = document.createElement('canvas');
    fade.width = 256; fade.height = 64;
    const fc = fade.getContext('2d')!;
    // Fades only left and right; towards the camera it stays solid so the
    // reflection never shows past the floor's near edge.
    const fg = fc.createLinearGradient(0, 0, 256, 0);
    fg.addColorStop(0, '#000000');
    fg.addColorStop(0.22, '#FFFFFF');
    fg.addColorStop(0.78, '#FFFFFF');
    fg.addColorStop(1, '#000000');
    fc.fillStyle = fg;
    fc.fillRect(0, 0, 256, 64);
    const floor = new THREE.Mesh(own(new THREE.PlaneGeometry(34, 40)), own(new THREE.MeshStandardMaterial({ color: '#0B0C0F', roughness: 0.8, metalness: 0.1, transparent: true, opacity: 0.9, alphaMap: own(new THREE.CanvasTexture(fade)), depthWrite: false })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = groundY - 0.01;
    if (!plane) ground.add(floor);
    const STEP = mode === 'BUS' ? 1.6 : 0.6;
    const COUNT = Math.ceil(40 / STEP);
    const tieGeo = own(mode === 'BUS' ? new THREE.BoxGeometry(0.8, 0.01, 0.08) : new THREE.BoxGeometry(0.14, 0.05, depth * S * 1.25));
    const tieMat = own(new THREE.MeshStandardMaterial({ color: mode === 'BUS' ? '#E8E8E8' : '#2A2C31', roughness: 0.9, emissive: mode === 'BUS' ? new THREE.Color('#303030') : new THREE.Color('#000') }));
    const ties = new THREE.InstancedMesh(tieGeo, tieMat, COUNT);
    if (!plane) ground.add(ties);
    if (mode !== 'BUS' && !plane) [1, -1].forEach(z => {
      const rail = new THREE.Mesh(own(new THREE.BoxGeometry(80, 0.07, 0.07)), metalMat);
      rail.position.set(0, groundY + 0.05, z * (halfW - 0.1));
      ground.add(rail);
    });
    const placeTies = (offset: number) => {
      const m = new THREE.Matrix4();
      for (let i = 0; i < COUNT; i++) {
        const x = -20 + ((i * STEP - offset) % 40 + 40) % 40;
        m.setPosition(x, groundY + 0.02, mode === 'BUS' ? (halfW + 0.9) : 0);
        ties.setMatrixAt(i, m);
      }
      ties.instanceMatrix.needsUpdate = true;
    };

    // Contact shadow
    const sh = document.createElement('canvas');
    sh.width = sh.height = 128;
    const shc = sh.getContext('2d')!;
    const grd = shc.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    shc.fillStyle = grd;
    shc.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(own(new THREE.PlaneGeometry(10, depth * S * 2.2)), own(new THREE.MeshBasicMaterial({ map: own(new THREE.CanvasTexture(sh)), transparent: true, depthWrite: false })));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = plane ? 0.2 : groundY + 0.03;
    scene.add(shadow);

    // Distant lights for parallax, and speed streaks
    const dot = document.createElement('canvas');
    dot.width = dot.height = 64;
    const dc = dot.getContext('2d')!;
    const dg = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    dg.addColorStop(0, 'rgba(255,255,255,1)');
    dg.addColorStop(1, 'rgba(255,255,255,0)');
    dc.fillStyle = dg;
    dc.fillRect(0, 0, 64, 64);
    const BOKEH = 46;
    const bokehPos = new Float32Array(BOKEH * 3);
    const bokehCol = new Float32Array(BOKEH * 3);
    const palette = ['#FFD9A0', '#A9C8FF', '#FFFFFF', MODE_COLOR[mode].main];
    for (let i = 0; i < BOKEH; i++) {
      bokehPos.set([Math.random() * 40 - 20, 0.6 + Math.random() * 4.2, -7 - Math.random() * 6], i * 3);
      const c = new THREE.Color(palette[i % palette.length]);
      bokehCol.set([c.r, c.g, c.b], i * 3);
    }
    const bokehGeo = own(new THREE.BufferGeometry());
    bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPos, 3));
    bokehGeo.setAttribute('color', new THREE.BufferAttribute(bokehCol, 3));
    const bokeh = new THREE.Points(bokehGeo, own(new THREE.PointsMaterial({ size: 0.55, map: own(new THREE.CanvasTexture(dot)), vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
    scene.add(bokeh);
    const streakMat = own(new THREE.MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    const streaks = Array.from({ length: 7 }, () => {
      const m = new THREE.Mesh(own(new THREE.PlaneGeometry(2.8 + Math.random() * 2, 0.012)), streakMat);
      m.position.set(Math.random() * 30 - 15, 0.7 + Math.random() * 3.4, -2.5 - Math.random() * 3);
      scene.add(m);
      return m;
    });

    // ── The can: acrylic shell, a liquid column you watch go down ──
    const can = new THREE.Group();
    const shell = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.3, 1.0, 40, 1, true)), own(new THREE.MeshPhysicalMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.2, roughness: 0.04, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false })));
    const liquidMat = own(new THREE.MeshPhysicalMaterial({ color: MODE_COLOR[mode].main, roughness: 0.25, clearcoat: 0.6, emissive: new THREE.Color(MODE_COLOR[mode].main), emissiveIntensity: 0.12 }));
    const liquid = new THREE.Mesh(own(new THREE.CylinderGeometry(0.265, 0.265, 1, 40)), liquidMat);
    const surface = new THREE.Mesh(own(new THREE.CircleGeometry(0.265, 40)), liquidMat);
    surface.rotation.x = -Math.PI / 2;
    const dome = new THREE.Mesh(own(new THREE.SphereGeometry(0.3, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)), metalMat);
    dome.position.y = 0.5;
    const nozzle = new THREE.Mesh(own(new THREE.CylinderGeometry(0.07, 0.08, 0.16, 16)), darkMat);
    nozzle.position.y = 0.86;
    const tip = new THREE.Object3D();
    tip.position.set(0, 0.88, -0.1);
    const band = new THREE.Mesh(own(new THREE.CylinderGeometry(0.305, 0.305, 0.16, 40)), own(new THREE.MeshStandardMaterial({ color: MODE_COLOR[mode].deep, roughness: 0.5, metalness: 0.3 })));
    band.position.y = -0.42;
    can.add(shell, liquid, surface, dome, nozzle, tip, band);
    can.scale.setScalar(0.85);
    can.visible = false;
    scene.add(can);

    // Spray mist
    const MIST = 220;
    const mistPos = new Float32Array(MIST * 3);
    const mistVel = new Float32Array(MIST * 3);
    const mistLife = new Float32Array(MIST);
    const mistGeo = own(new THREE.BufferGeometry());
    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    const mistMat = own(new THREE.PointsMaterial({ size: 0.09, map: own(new THREE.CanvasTexture(dot)), color: MODE_COLOR[mode].main, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    const mist = new THREE.Points(mistGeo, mistMat);
    mist.frustumCulled = false;
    scene.add(mist);
    let mistNext = 0;
    const puff = (from: THREE.Vector3, to: THREE.Vector3, n: number, spread = 0.8) => {
      for (let k = 0; k < n; k++) {
        const i = mistNext = (mistNext + 1) % MIST;
        mistPos.set([from.x, from.y, from.z], i * 3);
        const d = to.clone().sub(from).multiplyScalar(2 + Math.random());
        mistVel.set([d.x + (Math.random() - 0.5) * spread, d.y + (Math.random() - 0.5) * spread, d.z + (Math.random() - 0.5) * spread * 0.5], i * 3);
        mistLife[i] = 0.45;
      }
    };
    let nextHint = 2.5;

    // ── Simulation state ──
    // Start from wherever the journey is (a rebuilt scene picks up mid-way).
    const still = reduce || phaseRef.current === 'parked' || phaseRef.current === 'brake';
    const sim = {
      phase: phaseRef.current, v: still ? 0 : 1, vTarget: still ? 0 : 1, cam: still ? 1 : 0, camTarget: still ? 1 : 0, travel: 0, t: 0,
      level: 1, levelTarget: 1, slosh: 0, sloshV: 0, canPos: new THREE.Vector3(3.2, 0.9, 2.4), canTarget: new THREE.Vector3(3.2, 0.9, 2.4),
      spraying: false, hit: null as THREE.Vector3 | null, departAt: 0, visible: true,
    };
    const camA = { pos: new THREE.Vector3(7.4, 2.7, 11.2), at: new THREE.Vector3(-0.3, plane ? 1.7 : 1.15, 0) };
    const camB = { pos: new THREE.Vector3(0.3, plane ? 1.9 : 1.6, 14.2), at: new THREE.Vector3(0.3, plane ? 1.75 : 1.2, 0) };

    const redraw = (list: Stroke[]) => {
      const p = paintState.current;
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, texCanvas.width, texCanvas.height);
      tctx.drawImage(base, 0, 0);
      tctx.setTransform(TEX, 0, 0, TEX, 0, 0);
      p.tags.forEach(t => paintTag(tctx, t));
      if (p.mine && !list.length) paintTag(tctx, { kind: 'angry', x: p.spot.x, y: p.spot.y, r: p.spot.r, s: p.spot.s, color: p.accent, drips: [-6, 7] });
      list.forEach((s, i) => paintStroke(tctx, s, i, TEX));
      texture.needsUpdate = true;
      // Neon paint glows a little at night.
      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.globalAlpha = 1;
      gctx.drawImage(glowBase, 0, 0);
      gctx.setTransform(TEX, 0, 0, TEX, 0, 0);
      gctx.globalAlpha = 0.4;
      p.tags.forEach(t => paintTag(gctx, t));
      if (p.mine && !list.length) paintTag(gctx, { kind: 'angry', x: p.spot.x, y: p.spot.y, r: p.spot.r, s: p.spot.s, color: p.accent, drips: [-6, 7] });
      list.forEach((s, i) => paintStroke(gctx, s, i, TEX));
      gctx.globalAlpha = 1;
      glowTexture.needsUpdate = true;
    };
    api.current = {
      redraw,
      setPhase: phase => {
        sim.phase = phase;
        if (phase === 'brake') { sim.vTarget = 0; }
        if (phase === 'depart') { sim.camTarget = reduce ? 1 : 0; sim.vTarget = reduce ? 0 : 1; sim.departAt = sim.t; }
        if (phase === 'run') { sim.camTarget = reduce ? 1 : 0; sim.vTarget = reduce ? 0 : 1; }
      },
      setLevel: (l, c) => { sim.levelTarget = l; liquidMat.color.set(c); liquidMat.emissive.set(c); mistMat.color.set(c); },
    };
    redraw(live.current.strokes);
    // Touching "我受影响了" already reaches the scene: the vehicle starts to
    // slow under your finger, before you let go.
    hintRef.current.onLink?.({ anticipate: on => { if (sim.phase === 'run' && !hintRef.current.marked) sim.vTarget = on ? 0.3 : reduce ? 0 : 1; } });

    // ── Pointer: spray onto the body ──
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const front = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(halfW + 1.1));
    const toNdc = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
    };
    const stagePoint = (): [number, number] | null => {
      const hit = ray.intersectObject(body, false)[0];
      if (!hit || !hit.uv || !hit.face || hit.face.normal.z < 0.5) return null;
      sim.hit = hit.point.clone();
      return [hit.uv.x * STAGE.w, (1 - hit.uv.y) * STAGE.h];
    };
    let current: Stroke | null = null;
    let runs: Stroke[] = [];
    let spent = 0;
    let drip: { stroke: Stroke; timer: ReturnType<typeof setTimeout> | null; grow: ReturnType<typeof setInterval> | null } | null = null;
    const liveList = () => [...live.current.strokes, ...runs, ...(current ? [current] : []), ...(drip ? [drip.stroke] : [])];
    const stopDrip = (keep = true) => {
      if (!drip) return;
      if (drip.timer) clearTimeout(drip.timer);
      if (drip.grow) clearInterval(drip.grow);
      if (keep && drip.stroke.p.length > 2) { spent += strokeCost(drip.stroke); runs.push(drip.stroke); }
      drip = null;
    };
    const armDrip = (x: number, y: number) => {
      stopDrip();
      const { brush: b, left: budget } = live.current;
      const stroke: Stroke = { c: b.c, w: Math.max(1.6, b.w * 0.32), p: [x, y], d: 1 };
      const d = { stroke, timer: null as ReturnType<typeof setTimeout> | null, grow: null as ReturnType<typeof setInterval> | null };
      d.timer = setTimeout(() => {
        d.grow = setInterval(() => {
          const len = stroke.p.length > 2 ? stroke.p[3] - y : 0;
          if (len > 26 || spent + strokeCost(stroke) >= budget) { if (d.grow) clearInterval(d.grow); return; }
          stroke.p = [x, y, x, y + len + 1.6];
          redraw(liveList());
        }, 60);
      }, 380);
      drip = d;
    };
    const down = (e: PointerEvent) => {
      if (!live.current.drawing || sim.phase !== 'parked') return;
      toNdc(e);
      const pt = stagePoint();
      if (!pt) return;
      if (live.current.left <= 0.5 || live.current.strokes.length >= LIMITS.strokes) { live.current.onEmpty(); return; }
      renderer.domElement.setPointerCapture(e.pointerId);
      e.preventDefault();
      spent = 0; runs = [];
      current = { c: live.current.brush.c, w: live.current.brush.w, p: pt };
      sim.spraying = true;
      armDrip(pt[0], pt[1]);
      redraw(liveList());
    };
    const move = (e: PointerEvent) => {
      if (!live.current.drawing) return;
      toNdc(e);
      const at = new THREE.Vector3();
      if (ray.ray.intersectPlane(front, at)) sim.canTarget.set(at.x + 0.55, at.y + 0.75, at.z);
      if (!current) return;
      const pt = stagePoint();
      if (!pt) return;
      const total = live.current.strokes.reduce((n, s) => n + s.p.length / 2, 0);
      if (total + current.p.length / 2 >= LIMITS.points) return;
      const [lx, ly] = current.p.slice(-2);
      if (Math.hypot(pt[0] - lx, pt[1] - ly) < 1.5) return;
      if (spent + strokeCost({ ...current, p: [...current.p, ...pt] }) >= live.current.left) { live.current.onEmpty(); sim.spraying = false; return; }
      stopDrip();
      current.p.push(pt[0], pt[1]);
      sim.levelTarget = (live.current.left - spent - strokeCost(current)) / PAINT;
      armDrip(pt[0], pt[1]);
      redraw(liveList());
    };
    const up = () => {
      if (!current && !drip) return;
      const d = drip;
      if (d) { if (d.timer) clearTimeout(d.timer); if (d.grow) clearInterval(d.grow); }
      const add = [...runs, ...(current ? [current] : []), ...(d && d.stroke.p.length > 2 ? [d.stroke] : [])];
      drip = null; current = null; runs = []; sim.spraying = false; sim.hit = null;
      if (add.length) live.current.onChange([...live.current.strokes, ...add]);
    };
    const cv = renderer.domElement;
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    // ── Size, visibility, loop ──
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let raf = 0;
    let last = performance.now();
    const ease = (x: number) => x * x * (3 - 2 * x);
    const tmp = new THREE.Vector3();
    const look = new THREE.Vector3();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!sim.visible) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sim.t += dt;
      // Speed: brakes slow, departures surge
      const prevV = sim.v;
      sim.v += (sim.vTarget - sim.v) * (sim.vTarget < sim.v ? 1.6 : 1.1) * dt;
      if (sim.phase === 'brake' && sim.v < 0.05) {
        sim.v = 0;
        sim.camTarget = 1;
        sim.phase = 'parked';
        setPhase('parked');
      }
      if (sim.phase === 'depart' && sim.t - sim.departAt > 1.6) { sim.phase = 'run'; setPhase('run'); }
      const accel = (sim.v - prevV) / Math.max(dt, 0.001);
      sim.cam += (sim.camTarget - sim.cam) * Math.min(1, dt * 2.2);
      sim.travel += sim.v * dt * 12;
      // Camera
      const k = ease(Math.max(0, Math.min(1, sim.cam)));
      camera.position.lerpVectors(camA.pos, camB.pos, k);
      look.lerpVectors(camA.at, camB.at, k);
      camera.lookAt(look);
      // Vehicle: bob, sway, brake pitch
      vehicle.position.y = plane ? Math.sin(sim.t * 1.4) * 0.06 + 0.15 : Math.sin(sim.t * 11) * 0.008 * sim.v;
      vehicle.rotation.x = Math.sin(sim.t * 6.3) * 0.004 * sim.v;
      vehicle.rotation.z += ((plane ? Math.sin(sim.t * 0.9) * 0.03 : accel * 0.012) - vehicle.rotation.z) * Math.min(1, dt * 6);
      wheels.forEach(w => { w.rotation.z -= (sim.v * dt * 12) / 0.25; });
      if (mirror) {
        mirror.position.y = 2 * groundY - vehicle.position.y;
        mirror.rotation.set(-vehicle.rotation.x, 0, -vehicle.rotation.z);
        mirrorWheels.forEach((w, i) => { if (wheels[i]) w.rotation.z = wheels[i].rotation.z; });
      }
      lampMat.emissiveIntensity = 0.6 + sim.v * 1.6;
      if (!plane) placeTies(sim.travel);
      for (let i = 0; i < BOKEH; i++) {
        let x = bokehPos[i * 3] - sim.v * dt * 3.2;
        if (x < -20) x += 40;
        bokehPos[i * 3] = x;
      }
      bokehGeo.attributes.position.needsUpdate = true;
      streakMat.opacity = 0.14 * sim.v;
      streaks.forEach(s => { s.position.x -= sim.v * dt * 26; if (s.position.x < -16) s.position.x += 32; });
      // Can
      const parked = sim.phase === 'parked';
      can.visible = parked || (sim.phase === 'depart' && sim.t - sim.departAt < 0.4);
      if (!sim.spraying && !current) sim.canTarget.set(camB.at.x + 3.9, camB.at.y - 0.55, halfW + 1.7);
      tmp.copy(sim.canTarget).sub(sim.canPos);
      sim.sloshV += (-tmp.x * 3 - sim.slosh * 18) * dt;
      sim.sloshV *= 0.9;
      sim.slosh += sim.sloshV * dt * 6;
      sim.canPos.lerp(sim.canTarget, Math.min(1, dt * 14));
      can.position.copy(sim.canPos);
      can.rotation.set(-0.25, 0.5, sim.spraying ? -0.35 + Math.sin(sim.t * 40) * 0.02 : -0.1);
      sim.level += (sim.levelTarget - sim.level) * Math.min(1, dt * 8);
      const lvl = Math.max(0.0001, sim.level);
      liquid.scale.y = lvl * 0.96;
      liquid.position.y = -0.48 + (lvl * 0.96) / 2;
      surface.position.y = -0.48 + lvl * 0.96 + 0.001;
      surface.rotation.set(-Math.PI / 2 + sim.slosh * 0.25, 0, sim.slosh * 0.15);
      surface.visible = liquid.visible = lvl > 0.01;
      // An unspoken invitation: every few seconds a puff of paint comes in
      // from where the button is and lands on the body, as the button's can
      // gives a little shake.
      if (sim.phase === 'run' && !hintRef.current.marked && !reduce && sim.t > nextHint) {
        nextHint = sim.t + 7;
        puff(new THREE.Vector3(3.8, 0.2, halfW + 2.4), new THREE.Vector3(1 + Math.random() * 1.5, 1.3, halfW), 26, 0.5);
        hintRef.current.onHint?.();
      }
      // Mist from the nozzle towards the body
      if (sim.spraying && sim.hit) {
        const from = new THREE.Vector3();
        tip.getWorldPosition(from);
        for (let n = 0; n < 7; n++) {
          const i = mistNext = (mistNext + 1) % MIST;
          mistPos.set([from.x, from.y, from.z], i * 3);
          tmp.copy(sim.hit).sub(from).multiplyScalar(2.6 + Math.random());
          mistVel.set([tmp.x + (Math.random() - 0.5) * 0.8, tmp.y + (Math.random() - 0.5) * 0.8, tmp.z + (Math.random() - 0.5) * 0.4], i * 3);
          mistLife[i] = 0.35;
        }
      }
      for (let i = 0; i < MIST; i++) {
        if (mistLife[i] <= 0) { mistPos[i * 3 + 1] = -99; continue; }
        mistLife[i] -= dt;
        mistPos[i * 3] += mistVel[i * 3] * dt;
        mistPos[i * 3 + 1] += mistVel[i * 3 + 1] * dt;
        mistPos[i * 3 + 2] += mistVel[i * 3 + 2] * dt;
      }
      mistGeo.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([entry]) => { sim.visible = entry.isIntersecting; }, { rootMargin: '60px' });
    io.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      cv.removeEventListener('pointerdown', down);
      cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up);
      cv.removeEventListener('pointercancel', up);
      stopDrip(false);
      api.current = null;
      hintRef.current.onLink?.(null);
      disposables.forEach(d => d.dispose());
      renderer.dispose();
      cv.remove();
    };
    // The scene is built once per vehicle; live values flow through refs.
  }, [mode, reduce]);

  // Drawing needs the body to take touches; otherwise the page scrolls.
  useEffect(() => {
    const cv = host.current?.querySelector('canvas');
    if (cv) cv.style.touchAction = drawing ? 'none' : 'pan-y';
  }, [drawing]);

  const unit = tx(lang, UNIT[mode][0], UNIT[mode][1]);
  const pct = Math.round((left / PAINT) * 100);
  const caption = !doodle.loaded ? ' '
    : phase === 'brake' ? tx(lang, '正在停车…', 'Stopping…')
      : phase === 'parked' ? (empty ? tx(lang, '这罐漆用完了', 'This can is empty') : tx(lang, '在车身上拖动来喷，按住不动会流下漆痕', 'Drag on the body to spray; hold still and it drips'))
        : phase === 'depart' ? tx(lang, '你的涂鸦跟着车出发了', 'Off it goes, with your mark')
          : !doodle.marked ? null
            : tx(lang, `你和 ${others} 人的涂鸦正跟着这${unit}跑`, `Your mark and ${others} others ride along`);

  if (failed) return <><Graffiti mode={mode} seed={seed} storeKey={storeKey} doodle={doodle} lang={lang} open={open} onOpen={onOpen} onClose={onClose} /><div className="mt-3">{footer}</div></>;

  return (
    <div className="relative overflow-hidden rounded-[20px]" style={{ background: `radial-gradient(90% 80% at 50% 70%, ${color.soft}, transparent 70%), linear-gradient(180deg, #121419, ${C.surface2})` }}>
      <div ref={host} className="relative w-full" style={{ aspectRatio: '16 / 10', cursor: drawing ? 'crosshair' : 'default' }} />
      {/* How many have marked it, in the scene's corner rather than a sentence */}
      {doodle.loaded && phase === 'run' && (
        <span className={`absolute left-3 top-3 h-7 pl-2 pr-2.5 rounded-full flex items-center gap-1.5 tabular-nums ${TYPE.caption}`} style={{ background: 'rgba(10,11,13,0.55)', color: C.text, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
          <i className="w-[7px] h-[7px] rounded-full" style={{ background: color.main, boxShadow: `0 0 8px ${color.main}` }} />
          {tx(lang, `${doodle.count} 人的不满在车上`, `${doodle.count} marks on board`)}
        </span>
      )}
      <AnimatePresence initial={false}>
        {drawing && (
          <motion.div key="tools" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
            <div className="px-3 pt-1 flex items-center gap-1.5" role="radiogroup" aria-label={tx(lang, '颜色', 'Colour')}>
              {[color.main, ...SPRAY].map(c => (
                <button key={c} role="radio" aria-checked={brush.c === c} aria-label={c} onClick={() => setBrush(b => ({ ...b, c }))}
                  className="w-[26px] h-[26px] rounded-full transition-transform" style={{ background: c, transform: brush.c === c ? 'scale(1.12)' : 'none', boxShadow: brush.c === c ? '0 0 0 2px #15171B, 0 0 0 3.5px #FFFFFF' : 'none' }} />
              ))}
            </div>
            <div className="px-3 pt-2 pb-2 flex items-center gap-2">
              <div className="flex items-center gap-0.5 h-9 px-1 rounded-full" style={{ background: C.surface3 }} role="radiogroup" aria-label={tx(lang, '粗细', 'Size')}>
                {SIZES.map(w => (
                  <button key={w} role="radio" aria-checked={brush.w === w} aria-label={`${w}`} onClick={() => setBrush(b => ({ ...b, w }))} className="w-8 h-7 rounded-full flex items-center justify-center" style={{ background: brush.w === w ? '#3A3F48' : 'transparent' }}>
                    <i className="rounded-full" style={{ width: 3 + w / 1.5, height: 3 + w / 1.5, background: '#FFFFFF' }} />
                  </button>
                ))}
              </div>
              <button aria-label={tx(lang, '撤销', 'Undo')} onClick={() => setDraft(d => (d ?? saved).slice(0, -1))} disabled={!strokes.length} className="w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-35" style={{ background: C.surface3, color: '#FFFFFF' }}>
                <ArrowCounterClockwise size={16} weight="bold" />
              </button>
              <span className="ml-auto text-[12px] font-semibold tabular-nums" style={{ color: pct < 15 ? color.main : C.text3, fontFamily: 'var(--font-num)' }}>{tx(lang, `余量 ${pct}%`, `${pct}% left`)}</span>
              <button onClick={finish} disabled={saving} className={`h-9 px-4 rounded-full flex items-center gap-1.5 whitespace-nowrap ${TYPE.label} font-semibold disabled:opacity-60`} style={{ background: color.deep, color: '#FFFFFF' }}>
                <Check size={14} weight="bold" />{saving ? tx(lang, '上传中…', 'Uploading…') : tx(lang, '完成', 'Done')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {(caption || (phase === 'run' && doodle.marked && left > 0.5)) && (
        <div className="px-4 pt-1 pb-1 flex items-center justify-center gap-2 text-center">
          {caption && <p className={TYPE.label} style={{ color: empty ? color.main : C.text2 }}>{caption}</p>}
          {phase === 'run' && doodle.marked && left > 0.5 && (
            <button onClick={onOpen} className={`shrink-0 h-7 px-2.5 rounded-full ${TYPE.caption} font-semibold`} style={{ background: C.surface3, color: '#FFFFFF' }}>
              {saved.length ? tx(lang, `继续喷 · 剩 ${pct}%`, `Spray more · ${pct}%`) : tx(lang, '拿起喷罐', 'Pick up the can')}
            </button>
          )}
        </div>
      )}
      {/* The buttons live on the wall's own floor: what you press is part of the scene */}
      {footer && <div className="p-2.5 pt-2">{footer}</div>}
    </div>
  );
}
