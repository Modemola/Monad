"use client";

import { Environment, Lightformer, MeshReflectorMaterial, PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/// A bar of fine gold on a dark mirror, lit like a product photograph. The bar is a true cast
/// ingot — a frustum, narrower at the top — and its top face carries a stamp, the way bullion
/// is hallmarked with its refiner, purity and serial.

const W = 2.9; // bottom length
const D = 1.35; // bottom depth
const H = 0.82; // height
const TAPER = 0.8; // top as a fraction of the bottom

function ingotGeometry() {
  // A four-sided cylinder turned 45° is a square frustum; stretching it gives the bar.
  const g = new THREE.CylinderGeometry(TAPER * Math.SQRT1_2, Math.SQRT1_2, H, 4, 1, false);
  g.rotateY(Math.PI / 4);
  g.scale(W, 1, D);
  g.computeVertexNormals();
  return g;
}

/// The hallmark, drawn once onto a canvas and laid on the top face as an engraving.
function stampTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 448;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = "rgba(70,40,8,0.85)";
  x.lineWidth = 6;
  x.strokeRect(36, 36, c.width - 72, c.height - 72);
  x.lineWidth = 2;
  x.strokeRect(54, 54, c.width - 108, c.height - 108);
  x.fillStyle = "rgba(70,40,8,0.9)";
  x.textAlign = "center";
  x.font = "600 150px Georgia, serif";
  x.fillText("INGOT", c.width / 2, 228);
  x.font = "500 40px ui-monospace, monospace";
  x.fillText("FINE COMPUTE  ·  H100  ·  730 GPU-HR", c.width / 2, 300);
  x.font = "500 34px ui-monospace, monospace";
  x.fillText("999.9   ◆   MONAD   ◆   LOT 0001", c.width / 2, 362);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function Bar({ pointer, scroll, still }: { pointer: React.RefObject<{ x: number; y: number }>; scroll: React.RefObject<number>; still: boolean }) {
  const geometry = useMemo(ingotGeometry, []);
  const stamp = useMemo(stampTexture, []);
  const group = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (born.current === null) born.current = state.clock.elapsedTime;
    const p = pointer.current ?? { x: 0, y: 0 };
    const s = scroll.current ?? 0;

    if (still) {
      g.rotation.set(0, -0.32, 0);
      g.position.y = 0;
      return;
    }

    // It descends onto the mirror as the page opens, then rests, swaying around a front-facing
    // pose so the hallmark stays readable, and leaning toward the pointer.
    const age = Math.min((state.clock.elapsedTime - born.current) / 2.2, 1);
    const ease = 1 - Math.pow(1 - age, 4);
    const drop = (1 - ease) * 1.6;
    const t = state.clock.elapsedTime;
    g.position.y = THREE.MathUtils.damp(g.position.y, drop + Math.sin(t * 0.8) * 0.03, 6, delta);
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, -0.32 + Math.sin(t * 0.22) * 0.38 + p.x * 0.3 + s * 0.8 - (1 - ease) * 1.4, 3, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, p.y * 0.08, 3, delta);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} position={[0, H / 2, 0]} castShadow>
        <meshPhysicalMaterial color="#e9b764" metalness={1} roughness={0.24} clearcoat={0.5} clearcoatRoughness={0.12} envMapIntensity={1.35} />
      </mesh>
      {/* The stamp, a hair above the top face so it never z-fights. */}
      <mesh position={[0, H + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * TAPER * 0.86, D * TAPER * 0.8]} />
        <meshStandardMaterial map={stamp} transparent metalness={0.85} roughness={0.5} color="#a87430" />
      </mesh>
    </group>
  );
}

function Floor({ lite }: { lite: boolean }) {
  if (lite) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#020202" metalness={0} roughness={1} envMapIntensity={0} />
      </mesh>
    );
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[40, 40]} />
      <MeshReflectorMaterial
        blur={[400, 120]}
        // Blurred this hard, a 512 reflection is indistinguishable from 768 at under half the fill.
        resolution={512}
        mixBlur={1}
        mixStrength={5}
        roughness={1}
        depthScale={1.1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.3}
        color="#020202"
        metalness={0}
        envMapIntensity={0}
        mirror={0.3}
      />
    </mesh>
  );
}

function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      {/* A warm dome first, so every reflection the metal shows is lit, not black — then a
          jeweller's set of softboxes for the highlights that make it read as gold. */}
      <mesh scale={60}>
        <sphereGeometry args={[1, 32, 16]} />
        <meshBasicMaterial color="#5a3d1c" side={THREE.BackSide} />
      </mesh>
      <Lightformer form="rect" intensity={4} position={[0, 7, 0]} rotation-x={Math.PI / 2} scale={[12, 5, 1]} color="#fff3df" />
      <Lightformer form="rect" intensity={2.4} position={[-7, 2.5, 1]} rotation-y={Math.PI / 2} scale={[4, 8, 1]} color="#ffd9a0" />
      <Lightformer form="rect" intensity={2.4} position={[7, 2.5, 1]} rotation-y={-Math.PI / 2} scale={[4, 8, 1]} color="#ffc27a" />
      <Lightformer form="rect" intensity={1.6} position={[0, 2, 9]} scale={[14, 4, 1]} color="#fff0d6" />
      <Lightformer form="rect" intensity={1.2} position={[0, 3, -8]} rotation-y={Math.PI} scale={[14, 5, 1]} color="#ffb35a" />
    </Environment>
  );
}

/// A soft pool of shadow and warm bounce under the bar: grounds it without a shadow map.
function Pool() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.45, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
      <planeGeometry args={[W * 1.8, D * 2.4]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

/// Frames the bar low in a wide hero so the headline owns the upper half, and centres it in a
/// tall one.
function Rig({ scroll }: { scroll: React.RefObject<number> }) {
  const { camera, viewport } = useThree();
  const wide = viewport.aspect > 1.1;
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const s = scroll.current ?? 0;
    // Close and a little above, the way a product is shot; it eases back as the page scrolls.
    target.set(0, wide ? 2.9 : 3.1, (wide ? 6.2 : 8.2) + s * 1.5);
    camera.position.lerp(target, 1 - Math.exp(-4 * delta));
    camera.lookAt(0, 0.35, 0);
  });
  return null;
}

export default function GoldScene() {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const [visible, setVisible] = useState(true);
  const [lite, setLite] = useState(false);
  const [still, setStill] = useState(false);
  // Start a notch under full sharpness and earn the rest: a GPU with headroom climbs to 1.5, one
  // without drops to 1. A retina screen at 1.5x is over twice the pixels of 1x, every frame.
  const [dpr, setDpr] = useState(1.25);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLite(window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -((event.clientY / window.innerHeight) * 2 - 1),
      };
    };
    const onScroll = () => {
      scroll.current = Math.min(window.scrollY / window.innerHeight, 1.2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100px" });
    if (container.current) observer.observe(container.current);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    // The canvas fades up once the first frame is drawn, so shader compilation never shows as a pop.
    <div ref={container} className={`absolute inset-0 transition-opacity duration-[1600ms] ease-out ${ready ? "opacity-100" : "opacity-0"}`}>
      <Canvas
        onCreated={() => requestAnimationFrame(() => setReady(true))}
        dpr={lite ? Math.min(dpr, 1.25) : dpr}
        camera={{ position: [0, 2.9, 6.2], fov: 30 }}
        // No antialiasing on the canvas itself: the effect composer below renders the scene into
        // its own multisampled target, so canvas MSAA was paid for and then thrown away.
        gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}
      >
        <PerformanceMonitor onIncline={() => setDpr(1.5)} onDecline={() => setDpr(1)} flipflops={2} />
        <fog attach="fog" args={["#090807", 9, 22]} />
        <Suspense fallback={null}>
          <Rig scroll={scroll} />
          <Bar pointer={pointer} scroll={scroll} still={still} />
          <Floor lite={lite} />
          <Pool />
          <spotLight position={[0, 7, 1.5]} angle={0.3} penumbra={0.8} intensity={22} color="#ffd9a3" distance={14} />
          <pointLight position={[-2.5, 1.6, 2.5]} intensity={4} color="#ffb35a" distance={5} />
          <ambientLight intensity={0.15} />
          <Studio />
          <EffectComposer multisampling={lite ? 0 : 4} enableNormalPass={false}>
            <Bloom mipmapBlur intensity={lite ? 0.35 : 0.45} luminanceThreshold={0.86} luminanceSmoothing={0.15} radius={0.65} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
