"use client";

import { useEffect, useRef } from "react";

/// The light everything else sits in: molten glass seen from inside. Domain-warped noise,
/// flowing slowly, with thin specular ridges where cobalt, violet and gold meet, bending
/// around the cursor.
///
/// Plain WebGL, no library: one full-screen triangle and one fragment shader. It renders at a
/// fraction of device resolution (the image is soft by design, so nobody can tell), caps at
/// 30fps, stops when the tab is hidden, and draws a single still frame for anyone who has asked
/// their OS for reduced motion.

const VERT = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.045;

  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float md = length(p - m);
  // The cursor stirs the liquid: a gentle swirl that fades with distance.
  float swirl = 0.35 * exp(-md * 2.4);
  float ang = swirl * 2.0;
  p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (p - m) + m;

  p.y += uScroll * 0.35;

  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t)), fbm(p * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(p * 1.7 + 3.2 * q + vec2(1.7, 9.2) + t * 1.4),
                fbm(p * 1.7 + 3.2 * q + vec2(8.3, 2.8) - t * 1.2));
  float f = fbm(p * 1.5 + 3.6 * r);

  vec3 base   = vec3(0.010, 0.012, 0.030);
  vec3 cobalt = vec3(0.16, 0.36, 1.00);
  vec3 violet = vec3(0.44, 0.28, 1.00);
  vec3 gold   = vec3(1.00, 0.70, 0.30);

  vec3 col = base;
  col = mix(col, cobalt * 0.30, smoothstep(0.35, 0.95, f));
  col = mix(col, violet * 0.34, smoothstep(0.45, 1.05, length(q)) * 0.75);
  col = mix(col, gold * 0.20, smoothstep(0.62, 0.95, r.y) * smoothstep(0.4, 0.9, f) * 0.8);

  // Specular ridges: thin bright lines where the liquid folds.
  float ridge = pow(max(0.0, 1.0 - abs(f - 0.56) * 4.0), 8.0);
  col += mix(cobalt, gold, smoothstep(0.3, 0.8, r.x)) * ridge * 0.22;

  // A soft halo under the cursor.
  col += vec3(0.30, 0.38, 1.0) * exp(-md * 3.2) * 0.05;

  // Vignette, heavier at the bottom so content below the fold sits on darker ground.
  vec2 uv = gl_FragCoord.xy / uRes;
  float vig = smoothstep(1.25, 0.25, length((uv - vec2(0.5, 0.62)) * vec2(1.1, 1.35)));
  col *= mix(0.35, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`;

const SCALE = 0.5; // render resolution relative to CSS pixels
const FRAME_MS = 1000 / 30;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export function LiquidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // the CSS gradient underneath stands in

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uMouse = gl.getUniformLocation(program, "uMouse");
    const uScroll = gl.getUniformLocation(program, "uScroll");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0.62, y: 0.6, tx: 0.62, ty: 0.6 };
    let scroll = 0;
    let raf = 0;
    let last = 0;
    const start = performance.now();

    const resize = () => {
      const w = Math.max(1, Math.floor(window.innerWidth * SCALE));
      const h = Math.max(1, Math.floor(window.innerHeight * SCALE));
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };

    const draw = (now: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;
      gl.uniform1f(uTime, reduced ? 40 : (now - start) / 1000 + 40);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uScroll, scroll);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };

    const onMove = (event: PointerEvent) => {
      mouse.tx = event.clientX / window.innerWidth;
      mouse.ty = 1 - event.clientY / window.innerHeight;
    };
    const onScroll = () => {
      scroll = Math.min(window.scrollY / window.innerHeight, 4);
      if (reduced) draw(performance.now());
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(loop);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (reduced) {
      draw(performance.now());
    } else {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {/* Fallback light if WebGL is unavailable; the canvas paints over it when it is. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(79,140,255,0.25),transparent_55%),radial-gradient(ellipse_at_20%_70%,rgba(139,108,255,0.2),transparent_55%),#03040a]" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: "auto" }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(3,4,10,0.65))]" />
    </div>
  );
}
