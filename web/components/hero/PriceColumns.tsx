"use client";

import { Environment, Lightformer, MeshReflectorMaterial, RoundedBox, Sparkles } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/// The thesis as an object. One gold column per provider, each as tall as what that provider
/// charges for the same H100 on the same day; then a plane of light rises through them and stops
/// at the index — the single number they average to. Driven entirely by scroll.

export type Venue = { name: string; price: number };

const UNIT = 0.5; // world units per dollar
const SPACING = 1.35;

function smooth(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/// A provider's name and price, drawn once to a canvas and shown as a sprite above its column —
/// cheaper than DOM labels, and it lives in the same light as everything else.
function labelTexture(name: string, price: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const x = c.getContext("2d")!;
  x.textAlign = "center";
  x.fillStyle = "rgba(196,186,169,0.95)";
  x.font = "600 44px ui-monospace, SFMono-Regular, Menlo, monospace";
  x.fillText(name.toUpperCase(), 256, 58);
  x.fillStyle = "#e8b661";
  x.font = "600 66px ui-monospace, SFMono-Regular, Menlo, monospace";
  x.fillText(`$${price.toFixed(2)}`, 256, 132);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function Column({ venue, i, n, progress, lite }: { venue: Venue; i: number; n: number; progress: React.RefObject<number>; lite: boolean }) {
  const mesh = useRef<THREE.Group>(null);
  const sprite = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => labelTexture(venue.name, venue.price), [venue.name, venue.price]);
  const height = venue.price * UNIT;
  const x = (i - (n - 1) / 2) * SPACING;

  useFrame(() => {
    const p = progress.current ?? 0;
    // Columns rise one after another across the first part of the scroll.
    const rise = smooth(0.04 + i * 0.035, 0.3 + i * 0.035, p);
    if (mesh.current) {
      mesh.current.scale.y = Math.max(0.001, rise);
      mesh.current.position.y = (height * rise) / 2;
    }
    if (sprite.current) {
      (sprite.current.material as THREE.SpriteMaterial).opacity = smooth(0.25 + i * 0.03, 0.4 + i * 0.03, p);
    }
  });

  return (
    <group position={[x, 0, 0]}>
      <group ref={mesh}>
        <RoundedBox args={[0.78, height, 0.78]} radius={0.04} smoothness={lite ? 2 : 4}>
          <meshPhysicalMaterial color="#efbf6a" metalness={1} roughness={0.24} clearcoat={0.45} envMapIntensity={1.75} />
        </RoundedBox>
      </group>
      <sprite ref={sprite} position={[0, height + 0.5, 0]} scale={[1.3, 0.41, 1]}>
        <spriteMaterial map={texture} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}

/// The index, as a plane of light. It rises from the floor and settles at its price.
function IndexPlane({ level, width, progress }: { level: number; width: number; progress: React.RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          varying vec2 vUv; uniform float uTime; uniform float uOpacity;
          void main(){
            vec2 g = abs(fract(vUv * vec2(28.0, 8.0)) - 0.5);
            float grid = 1.0 - smoothstep(0.0, 0.035, min(g.x, g.y));
            float edge = smoothstep(0.5, 0.0, abs(vUv.x - 0.5)) * smoothstep(0.5, 0.15, abs(vUv.y - 0.5));
            float scan = smoothstep(0.02, 0.0, abs(fract(vUv.x - uTime * 0.08) - 0.5) - 0.48);
            vec3 c = vec3(1.0, 0.72, 0.36);
            float a = (0.10 + grid * 0.22 + scan * 0.35) * edge * uOpacity;
            gl_FragColor = vec4(c * a, a);
          }`,
      }),
    [],
  );

  useFrame((state) => {
    const p = progress.current ?? 0;
    const lift = smooth(0.48, 0.72, p);
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uOpacity.value = smooth(0.42, 0.55, p);
    if (group.current) group.current.position.y = level * lift;
  });

  return (
    <group ref={group}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} material={material}>
        <planeGeometry args={[width, 3.2]} />
      </mesh>
      {/* The bright leading edge. */}
      <mesh position={[0, 0, 1.6]}>
        <boxGeometry args={[width, 0.012, 0.012]} />
        <meshBasicMaterial color="#ffd38a" toneMapped={false} />
      </mesh>
    </group>
  );
}

function CameraPath({ progress }: { progress: React.RefObject<number> }) {
  const { camera, viewport } = useThree();
  const wide = viewport.aspect > 1.1;
  const target = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    const p = progress.current ?? 0;
    // A slow orbit and climb: low and to the side as the columns rise, front-on and higher as
    // the index settles, so the plane reads as a line across all eight.
    const angle = THREE.MathUtils.lerp(-0.5, 0.06, smooth(0, 0.85, p));
    const radius = wide ? THREE.MathUtils.lerp(19, 17, p) : THREE.MathUtils.lerp(27, 24, p);
    const height = THREE.MathUtils.lerp(2.2, 5.2, smooth(0.1, 0.8, p));
    target.set(Math.sin(angle) * radius, height, Math.cos(angle) * radius);
    camera.position.lerp(target, 1 - Math.exp(-5 * delta));
    camera.lookAt(0.6, wide ? 2.4 : 2.9, 0);
  });
  return null;
}

export default function PriceColumns({ venues, index, progress }: { venues: Venue[]; index: number; progress: React.RefObject<number> }) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [lite, setLite] = useState(false);

  useEffect(() => {
    setLite(window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "200px" });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);

  const width = venues.length * SPACING + 1.2;

  return (
    <div ref={container} className="absolute inset-0">
      <Canvas
        dpr={lite ? 1 : [1, 1.5]}
        camera={{ position: [-9, 2.2, 17], fov: 30 }}
        gl={{ antialias: false, alpha: true }} // the composer multisamples; see GoldScene
        frameloop={visible ? "always" : "never"}
      >
        <fog attach="fog" args={["#090807", 18, 40]} />
        <Suspense fallback={null}>
          <CameraPath progress={progress} />
          {venues.map((venue, i) => (
            <Column key={venue.name} venue={venue} i={i} n={venues.length} progress={progress} lite={lite} />
          ))}
          <IndexPlane level={index * UNIT} width={width} progress={progress} />
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[60, 60]} />
            {lite ? (
              <meshStandardMaterial color="#020202" metalness={0} roughness={1} envMapIntensity={0} />
            ) : (
              <MeshReflectorMaterial blur={[300, 90]} resolution={384} mixBlur={1} mixStrength={6} roughness={1} depthScale={1} minDepthThreshold={0.4} maxDepthThreshold={1.2} color="#020202" metalness={0} envMapIntensity={0} mirror={0.35} />
            )}
          </mesh>
          <Sparkles count={lite ? 25 : 60} scale={[14, 7, 6]} position={[0, 3, 0]} size={1.8} speed={0.2} opacity={0.6} color="#f6dca6" />
          <spotLight position={[0, 12, 4]} angle={0.6} penumbra={1} intensity={90} color="#fff1d6" distance={30} />
          <ambientLight intensity={0.12} />
          <Environment resolution={128} frames={1}>
            <mesh scale={60}>
              <sphereGeometry args={[1, 32, 16]} />
              <meshBasicMaterial color="#5a3d1c" side={THREE.BackSide} />
            </mesh>
            <Lightformer form="rect" intensity={4} position={[0, 8, 0]} rotation-x={Math.PI / 2} scale={[14, 3, 1]} color="#fff6e6" />
            <Lightformer form="rect" intensity={2.6} position={[-8, 3, 3]} rotation-y={Math.PI / 2} scale={[3, 8, 1]} color="#ffcf8a" />
            <Lightformer form="rect" intensity={2.6} position={[8, 3, 3]} rotation-y={-Math.PI / 2} scale={[3, 8, 1]} color="#ffb35a" />
          </Environment>
          <EffectComposer multisampling={lite ? 0 : 4} enableNormalPass={false}>
            <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.75} luminanceSmoothing={0.2} radius={0.7} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
