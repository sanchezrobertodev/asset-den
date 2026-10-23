import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { errorText } from "../api";
import { addLights, dispose, frame, loadModel, stats } from "../lib/models";
import { reducedMotion } from "../lib/prefs";
import type { Asset } from "../types";
import { chip, Note, toggleChip, usePreviewFailure } from "./Viewers";

// Its own chunk: three.js loads on the first model preview, not at startup.
export default function ModelView({ asset, full }: { asset: Asset; full: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState(false);
  // Animated models play their first clip unless the OS asks for reduced motion; full screen can toggle it.
  const [playClip, setPlayClip] = useState(() => !reducedMotion());
  const playing = useRef(playClip);
  playing.current = playClip;
  const [info, setInfo] = useState<{ vertices: number; triangles: number; clips: number } | null>(null);
  const fail = usePreviewFailure();
  const wire = useRef<(on: boolean) => void>(() => {});
  const reset = useRef<() => void>(() => {});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    setInfo(null);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    addLights(scene);
    const camera = new THREE.PerspectiveCamera(40, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const clock = new THREE.Clock();
    let mixer: THREE.AnimationMixer | null = null;
    let object: THREE.Object3D | null = null;
    let raf = 0;
    let live = true;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = clock.getDelta();
      if (playing.current) mixer?.update(dt);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    loadModel(asset)
      .then(({ object: o, animations }) => {
        if (!live) return dispose(o);
        object = o;
        scene.add(o);
        const r = frame(camera, o, controls.target);
        reset.current = () => frame(camera, o, controls.target);
        const css = getComputedStyle(document.documentElement);
        const grid = new THREE.GridHelper(r * 4, 20, new THREE.Color(css.getPropertyValue("--line-x").trim()), new THREE.Color(css.getPropertyValue("--line").trim()));
        grid.position.y = new THREE.Box3().setFromObject(o).min.y;
        scene.add(grid);
        if (animations.length) {
          mixer = new THREE.AnimationMixer(o);
          mixer.clipAction(animations[0]).play();
          mixer.update(0);
        }
        wire.current = (on) =>
          o.traverse((c) => {
            const m = (c as THREE.Mesh).material;
            for (const mat of Array.isArray(m) ? m : m ? [m] : []) (mat as THREE.MeshStandardMaterial).wireframe = on;
          });
        setInfo({ ...stats(o), clips: animations.length });
      })
      .catch((e) => live && fail(errorText(e)));

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      if (object) dispose(object);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [asset.id, asset.path, asset.mtime, fail]);

  useEffect(() => wire.current(wireframe), [wireframe, info]);

  return (
    <div className={clsx("stripes relative w-full overflow-hidden rounded-xl", full ? "h-full" : "h-[200px]")}>
      <div ref={box} className="h-full w-full" />
      {!info && (
        <div className="pointer-events-none absolute inset-0">
          <Note busy>Loading model…</Note>
        </div>
      )}
      {info && (
        <div className="absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
          <span className={chip}>
            {info.triangles.toLocaleString()} tris · {info.vertices.toLocaleString()} verts
            {info.clips > 0 && ` · ${info.clips} anim`}
          </span>
          {full && (
            <>
              <button type="button" aria-pressed={wireframe} onClick={() => setWireframe((w) => !w)} className={toggleChip(wireframe)}>
                Wireframe
              </button>
              {info.clips > 0 && (
                <button type="button" aria-pressed={playClip} onClick={() => setPlayClip((p) => !p)} className={toggleChip(playClip)}>
                  Animate
                </button>
              )}
              <button type="button" onClick={() => reset.current()} className={clsx(chip, "font-sans")}>
                Reset view
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
