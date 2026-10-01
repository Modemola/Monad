"use client";

import { Environment, Float, Lightformer, MeshTransmissionMaterial, Sparkles } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/// The brand mark, made physical: a glass ingot with a molten-gold bar sealed inside, floating in
/// its own light. Geometry is the mark's trapezoid section, extruded and beveled, so the hero and
/// the logo are the same object.

const GLASS_BACKDROP = new THREE.Color("#0b1030");

function ingotGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-1.6, -0.62);
  shape.lineTo(1.6, -0.62);
  shape.lineTo(1.0, 0.62);
  shape.lineTo(-1.0, 0.62);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1.5,
    bevelEnabled: true,
    bevelThickness: 0.12,
    bevelSize: 0.1,
    bevelSegments: 8,
    curveSegments: 4,
  });
  geometry.center();
  geometry.computeVertexNormals();
  return geometry;
}

/// A soft disc of light behind the ingot. It is what the glass refracts, so it decides the
/// colour the ingot appears to hold.
function Aura() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform float uTime;
          void main(){
            vec2 p = vUv - 0.5;
            float r = length(p);
            float a = atan(p.y, p.x);
            vec3 cobalt = vec3(0.22,0.42,1.0);
            vec3 violet = vec3(0.52,0.32,1.0);
            vec3 gold = vec3(1.0,0.70,0.32);
            vec3 c = mix(cobalt, violet, 0.5 + 0.5*sin(a*2.0 + uTime*0.35));
            c = mix(c, gold, 0.35 + 0.25*sin(a*3.0 - uTime*0.5));
            float glow = pow(max(0.0, 1.0 - r * 2.6), 2.2) * 0.75;
            gl_FragColor = vec4(c * glow, glow);
          }`,
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <mesh position={[0.4, 0.1, -3]} material={material}>
      <planeGeometry args={[16, 16]} />
    </mesh>
  );
}

/// A ring of light orbiting behind the ingot, tilted like a planetary ring.
function Halo() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.12;
  });
  return (
    <mesh ref={ref} position={[0, 0, -1.2]} rotation={[1.2, 0.2, 0]}>
      <torusGeometry args={[2.5, 0.008, 16, 220]} />
      <meshBasicMaterial color="#ffe3a6" transparent opacity={0.45} toneMapped={false} />
    </mesh>
  );
}

function Ingot({ pointer, scroll, lite }: { pointer: React.RefObject<{ x: number; y: number }>; scroll: React.RefObject<number>; lite: boolean }) {
  const geometry = useMemo(ingotGeometry, []);
  const group = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const p = pointer.current ?? { x: 0, y: 0 };
    const s = scroll.current ?? 0;
    const targetY = -0.55 + p.x * 0.45 + state.clock.elapsedTime * 0.12 + s * 1.4;
    const targetX = 0.32 - p.y * 0.25 + s * 0.6;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, targetY, 3, delta);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, targetX, 3, delta);
    g.position.y = THREE.MathUtils.damp(g.position.y, 0.15 - s * 1.6, 4, delta);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry}>
        <MeshTransmissionMaterial
          backside
          backsideThickness={0.6}
          samples={lite ? 4 : 8}
          resolution={lite ? 256 : 768}
          transmission={1}
          roughness={0.06}
          thickness={0.9}
          ior={1.42}
          chromaticAberration={0.035}
          anisotropy={0.25}
          distortion={0.12}
          distortionScale={0.35}
          temporalDistortion={0.04}
          clearcoat={1}
          clearcoatRoughness={0.05}
          attenuationDistance={2.4}
          attenuationColor="#dbe4ff"
          color="#f4f7ff"
          background={GLASS_BACKDROP}
        />
      </mesh>
      <mesh ref={core} geometry={geometry} scale={0.56}>
        <meshStandardMaterial
          color="#ffcf73"
          metalness={0.9}
          roughness={0.22}
          emissive="#b8741a"
          emissiveIntensity={0.55}
          envMapIntensity={2.2}
        />
      </mesh>
    </group>
  );
}

function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={3.5} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 4, 1]} color="#ffffff" />
      <Lightformer form="rect" intensity={6} position={[-6, 1, 1]} rotation-y={Math.PI / 2} scale={[4, 8, 1]} color="#4f8cff" />
      <Lightformer form="rect" intensity={6} position={[6, 1, 1]} rotation-y={-Math.PI / 2} scale={[4, 8, 1]} color="#8b6cff" />
      <Lightformer form="ring" intensity={5} position={[0, -4, 3]} rotation-x={-Math.PI / 2} scale={4} color="#f3c66f" />
      <Lightformer form="rect" intensity={2} position={[0, 0, 8]} scale={[10, 3, 1]} color="#dfe6ff" />
    </Environment>
  );
}

export default function IngotScene() {
  const container = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const scroll = useRef(0);
  const [visible, setVisible] = useState(true);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    setLite(window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
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

    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "100px",
    });
    if (container.current) observer.observe(container.current);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={container} className="absolute inset-0">
      <Canvas
        dpr={lite ? [1, 1.5] : [1, 2]}
        camera={{ position: [0, 0.1, 10.5], fov: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}
      >
        <Suspense fallback={null}>
          <Aura />
          <Halo />
          <Float speed={1.3} rotationIntensity={0.25} floatIntensity={0.7} floatingRange={[-0.12, 0.12]}>
            <Ingot pointer={pointer} scroll={scroll} lite={lite} />
          </Float>
          <Sparkles count={lite ? 40 : 90} scale={[9, 5, 4]} size={2.4} speed={0.3} opacity={0.8} color="#ffe3a6" />
          <Sparkles count={lite ? 25 : 60} scale={[10, 6, 5]} size={1.6} speed={0.22} opacity={0.6} color="#8db4ff" />
          <ambientLight intensity={0.25} />
          <directionalLight position={[3, 5, 4]} intensity={1.4} color="#ffffff" />
          <pointLight position={[0, -2.5, 2]} intensity={6} color="#f3c66f" distance={8} />
          <Studio />
        </Suspense>
      </Canvas>
    </div>
  );
}
