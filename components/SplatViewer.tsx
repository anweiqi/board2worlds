"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Remote SPZ url (will be proxied) */
  spzUrl: string;
  metricScaleFactor?: number;
  groundPlaneOffset?: number;
  className?: string;
}

/**
 * Renders a World Labs SPZ splat with three.js + Spark.
 * Marble SPZ uses the marble_raw_opencv frame; the Marble viewer rotates 180deg around X.
 */
export default function SplatViewer({
  spzUrl,
  metricScaleFactor,
  groundPlaneOffset,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>("Loading splat…");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { SplatMesh, SparkRenderer, SparkControls } = await import("@sparkjsdev/spark");
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.appendChild(renderer.domElement);
      renderer.domElement.style.outline = "none";
      renderer.domElement.tabIndex = 0;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0b0c);
      const camera = new THREE.PerspectiveCamera(
        70,
        container.clientWidth / container.clientHeight,
        0.05,
        1000,
      );
      // After metric scaling + ground alignment the ground is at y=0 and +y is up.
      // Stand at eye height, look forward (-Z; Marble's raw +Z after the X rotation).
      const hasMetric = !!metricScaleFactor && metricScaleFactor > 0;
      camera.position.set(0, hasMetric ? 1.6 : 0, 0);

      const spark = new SparkRenderer({ renderer });
      scene.add(spark);

      const proxied = `/api/proxy?url=${encodeURIComponent(spzUrl)}`;
      const scale = metricScaleFactor && metricScaleFactor > 0 ? metricScaleFactor : 1;
      const offset = groundPlaneOffset ?? 0;

      const splat = new SplatMesh({
        url: proxied,
        fileType: undefined,
        fileName: "world.spz",
        onLoad: () => {
          if (!disposed) setStatus("");
        },
        onProgress: (e) => {
          if (disposed) return;
          if (e.lengthComputable) {
            setStatus(`Loading splat… ${Math.round((e.loaded / e.total) * 100)}%`);
          }
        },
      });
      // Apply metric scale, then the Marble axis convention (180deg about X).
      splat.scale.setScalar(scale);
      splat.rotation.x = Math.PI;
      // ground_plane_offset moves the metric ground to y=0 (applied to centers, pre-rotation).
      // After the X rotation, raw +y becomes -y, so the offset flips sign.
      splat.position.y = offset;
      scene.add(splat);

      const controls = new SparkControls({ canvas: renderer.domElement });

      const onResize = () => {
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      let raf = 0;
      const loop = () => {
        raf = requestAnimationFrame(loop);
        controls.update(camera);
        renderer.render(scene, camera);
      };
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        scene.remove(splat);
        splat.dispose?.();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })().catch((err) => {
      console.error(err);
      if (!disposed) setStatus(`Viewer error: ${err instanceof Error ? err.message : String(err)}`);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [spzUrl, metricScaleFactor, groundPlaneOffset]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {status && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">{status}</span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/50 px-2 py-1 text-[11px] text-white/80">
        Drag to look · WASD / arrows to move · scroll to dolly
      </div>
    </div>
  );
}
