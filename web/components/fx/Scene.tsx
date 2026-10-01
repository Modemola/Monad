"use client";

import { Component, useEffect, useRef, useState, type ReactNode } from "react";

/// Whether this browser can render WebGL on a real GPU. Decided after mount (the server has no
/// canvas), so it starts as `null`: unknown.
///
/// Software rendering counts as no. A browser whose GPU is blocklisted still hands out a WebGL
/// context, backed by SwiftShader or llvmpipe on the CPU, and the scenes here would then run at a
/// frame or two a second while blocking the main thread — a frozen page is worse than a drawn one.
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const options = { failIfMajorPerformanceCaveat: true };
    const context = (canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options)) as
      | WebGLRenderingContext
      | null;
    if (!context) return false;
    const info = context.getExtension("WEBGL_debug_renderer_info");
    const renderer = info ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
    // Free the probe's context straight away: browsers cap live contexts per page.
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return !software;
  } catch {
    return false;
  }
}

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn("3D scene unavailable; showing the static fallback.", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/// A 3D scene that can never take the page down with it, and never slows the first paint.
///
/// Without this, a browser that cannot create a WebGL context — a blocked GPU, a locked-down
/// corporate laptop, some privacy browsers — threw inside three.js, and the error unmounted the
/// whole landing page. Now the scene is only mounted where WebGL exists, any failure inside it is
/// caught here, and either way the visitor sees a drawn fallback instead.
///
/// `mount` decides when three.js is fetched at all: "idle" waits for the browser to finish the
/// first render (the hero), "near" waits until the scene is about to scroll into view (the set
/// piece further down). Neither competes with the headline for the main thread.
export function Scene({
  children,
  fallback,
  mount = "idle",
}: {
  children: ReactNode;
  fallback: ReactNode;
  mount?: "idle" | "near";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // `?3d=on` forces the scenes (e.g. to inspect them under software rendering), `?3d=off` forces
    // the drawn fallbacks.
    const force = new URLSearchParams(window.location.search).get("3d");
    setOk(force === "on" ? true : force === "off" ? false : supportsWebGL());
  }, []);

  useEffect(() => {
    if (!ok) return;
    if (mount === "near") {
      const node = box.current;
      if (!node) return;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setReady(true);
            observer.disconnect();
          }
        },
        { rootMargin: "900px 0px" },
      );
      observer.observe(node);
      return () => observer.disconnect();
    }
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => setReady(true), { timeout: 1500 });
    return () => cancel(handle);
  }, [ok, mount]);

  return (
    <div ref={box} className="absolute inset-0">
      {ok === false ? fallback : ok && ready ? <SceneBoundary fallback={fallback}>{children}</SceneBoundary> : null}
    </div>
  );
}
