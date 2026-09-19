import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Configuration } from "../domain";

type Props = {
  configurations: Configuration[];
  selected: string;
  onSelect: (id: string) => void;
  onHover: (c: Configuration | null) => void;
  onFailure: () => void;
  resetKey: number;
};
export default function Scene({
  configurations,
  selected,
  onSelect,
  onHover,
  onFailure,
  resetKey,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cameraPosition = useRef<THREE.Vector3 | null>(null);
  const previousReset = useRef(resetKey);
  const callbacks = useRef({ onSelect, onHover, onFailure });
  callbacks.current = { onSelect, onHover, onFailure };
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      callbacks.current.onFailure();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 100);
    if (previousReset.current !== resetKey) {
      cameraPosition.current = null;
      previousReset.current = resetKey;
    }
    if (cameraPosition.current) camera.position.copy(cameraPosition.current);
    else camera.position.set(10, 7.2, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 10;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2.05;
    const textures: THREE.Texture[] = [];
    function line(a: number[], b: number[], color = "#30392e", opacity = 0.8) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...a),
        new THREE.Vector3(...b),
      ]);
      const obj = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
      );
      scene.add(obj);
    }
    function label(
      text: string,
      position: number[],
      color = "#85907e",
      scale = 1,
    ) {
      const cv = document.createElement("canvas");
      const ctx = cv.getContext("2d")!;
      ctx.font = "40px monospace";
      cv.width = Math.ceil(ctx.measureText(text).width + 30);
      cv.height = 64;
      ctx.font = "40px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(text, cv.width / 2, 45);
      const texture = new THREE.CanvasTexture(cv);
      textures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          depthTest: false,
          transparent: true,
        }),
      );
      sprite.position.set(...(position as [number, number, number]));
      sprite.scale.set((cv.width / 64) * 0.58 * scale, 0.58 * scale, 1);
      scene.add(sprite);
    }
    for (let x = -4; x <= 4; x += 1) line([x, 0, -3], [x, 0, 3]);
    for (let z = -3; z <= 3; z += 0.75) line([-4, 0, z], [4, 0, z]);
    for (let y = 1; y <= 5; y++) {
      line([-4, y, -3], [4, y, -3], "#252d24", 0.65);
      line([-4, y, -3], [-4, y, 3], "#252d24", 0.65);
    }
    line([-4, 0, 3], [4, 0, 3], "#75826c");
    line([-4, 0, 3], [-4, 5, 3], "#75826c");
    line([4, 0, 3], [4, 0, -3], "#75826c");
    const maxLatency = Math.max(
      10,
      Math.ceil(Math.max(...configurations.map((c) => c.latency)) / 10) * 10,
    );
    const maxResource = Math.max(
      0.1,
      Math.ceil(Math.max(...configurations.map((c) => c.resource.value)) * 10) /
        10,
    );
    for (let i = 0; i <= 4; i++)
      label(
        `${Math.round((maxLatency * i) / 4)}s`,
        [-4 + i * 2, -0.3, 3.35],
        "#7e8878",
        0.65,
      );
    for (let i = 1; i <= 5; i++)
      label(`${i * 20}%`, [-4.65, i, 3], "#7e8878", 0.65);
    for (let i = 0; i <= 2; i++)
      label(
        `${((maxResource * i) / 2).toFixed(2)}`,
        [4.55, 0, 3 - i * 3],
        "#7e8878",
        0.65,
      );
    label("LATENCY (seconds) →", [0, -0.9, 4]);
    label("TASK QUALITY ↑", [-4.2, 5.65, 3]);
    label(
      `RESOURCE${configurations.some(c => c.resource.estimated) ? " EST." : ""} (${configurations[0]?.resource.unit ?? "units"})`,
      [4.5, -0.8, -1],
      "#85907e",
      0.7,
    );
    const meshes: THREE.Mesh[] = [];
    const position = (c: Configuration) =>
      new THREE.Vector3(
        -4 + (c.latency / maxLatency) * 8,
        c.quality / 20,
        3 - (c.resource.value / maxResource) * 6,
      );
    configurations.forEach((c) => {
      const active = c.id === selected;
      const color =
        c.recommendation === "balanced"
          ? "#c3f478"
          : c.recommendation === "performance"
            ? "#ac9cff"
            : c.recommendation === "efficient"
              ? "#64dcca"
              : c.selectedForBenchmark
                ? "#c3f478"
                : "#849775";
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(
          active ? 0.18 : c.evidence === "measured" ? 0.14 : 0.115,
          24,
          16,
        ),
        new THREE.MeshBasicMaterial({
          color,
          transparent: c.evidence === "predicted",
          opacity: c.evidence === "predicted" ? 0.36 : 1,
        }),
      );
      mesh.position.copy(position(c));
      mesh.userData.config = c;
      scene.add(mesh);
      meshes.push(mesh);
      if (c.selectedForBenchmark) {
        line(
          [mesh.position.x, 0, mesh.position.z],
          mesh.position.toArray(),
          color,
          0.2,
        );
        label(
          `#${c.id}${c.recommendation ? " · " + c.recommendation.toUpperCase() : ""}`,
          [mesh.position.x, mesh.position.y + 0.45, mesh.position.z],
          color,
          c.recommendation ? 0.78 : 0.7,
        );
      }
      if (active || c.pareto) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.22, active ? 0.245 : 0.23, 48),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: active ? 1 : 0.6,
            side: THREE.DoubleSide,
          }),
        );
        ring.position.copy(mesh.position);
        ring.quaternion.copy(camera.quaternion);
        ring.userData.billboard = true;
        scene.add(ring);
      }
    });
    const frontier = configurations
      .filter((c) => c.pareto)
      .sort((a, b) => a.latency - b.latency);
    for (let i = 1; i < frontier.length; i++)
      line(
        position(frontier[i - 1]).toArray(),
        position(frontier[i]).toArray(),
        "#c3f478",
        0.6,
      );
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    function hit(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(meshes)[0]?.object.userData.config as
        Configuration | undefined;
    }
    let down = [0, 0];
    function pointerDown(e: PointerEvent) {
      down = [e.clientX, e.clientY];
    }
    function move(e: PointerEvent) {
      const c = hit(e);
      callbacks.current.onHover(c ?? null);
      renderer.domElement.style.cursor = c ? "pointer" : "grab";
    }
    function select(e: PointerEvent) {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
        const c = hit(e);
        if (c) callbacks.current.onSelect(c.id);
      }
    }
    function leave() {
      callbacks.current.onHover(null);
    }
    function lost(e: Event) {
      e.preventDefault();
      callbacks.current.onFailure();
    }
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", select);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let frame = 0;
    const render = () => {
      try {
        controls.update();
        scene.children.forEach((o) => {
          if (o.userData.billboard) o.quaternion.copy(camera.quaternion);
        });
        renderer.render(scene, camera);
        frame = requestAnimationFrame(render);
      } catch {
        callbacks.current.onFailure();
      }
    };
    render();
    return () => {
      cameraPosition.current = camera.position.clone();
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", select);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        } else if (o instanceof THREE.Sprite) o.material.dispose();
      });
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [configurations, selected, resetKey]);
  return (
    <div
      className="scene"
      ref={host}
      role="img"
      aria-label="Interactive 3D scatter plot. X: latency. Y: task quality. Z: resource. Use the configuration selector below for keyboard access."
    />
  );
}
