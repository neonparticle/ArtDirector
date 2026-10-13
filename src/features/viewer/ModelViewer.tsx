import {
  Bounds,
  Environment,
  Grid,
  Lightformer,
  OrbitControls,
  useBounds,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Grid3x3, Loader2, Rotate3d, RotateCcw, Shapes, Sun } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  disposeObject,
  type LoadedModel,
  loadModel,
  type ModelFormat,
  modelStats,
} from "./model/loadModel";
import { Stage } from "./Stage";

type Props = {
  url: string;
  format: ModelFormat;
  mtlUrl?: string;
};

export function ModelViewer({ url, format, mtlUrl }: Props) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wireframe, setWireframe] = useState(false);
  const [grid, setGrid] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [envIntensity, setEnvIntensity] = useState(1);
  const [clip, setClip] = useState<string>("");
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    let alive = true;
    let loaded: LoadedModel | null = null;
    setModel(null);
    setError(null);
    loadModel(url, format, { mtlUrl })
      .then((m) => {
        if (!alive) return disposeObject(m.scene);
        loaded = m;
        normalize(m.scene);
        setModel(m);
        setClip(m.animations[0]?.name ?? "");
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => {
      alive = false;
      if (loaded) disposeObject(loaded.scene);
    };
  }, [url, format, mtlUrl]);

  useEffect(() => {
    model?.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if ("wireframe" in m) (m as THREE.MeshStandardMaterial).wireframe = wireframe;
      }
    });
  }, [model, wireframe]);

  const stats = useMemo(() => (model ? modelStats(model.scene) : null), [model]);

  return (
    <Stage>
      {!model && !error && (
        <Loader2 className="absolute top-1/2 left-1/2 size-8 -translate-1/2 animate-spin text-ember" />
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-arc">
          Could not load model: {error}
        </div>
      )}

      <Canvas
        camera={{ fov: 40, position: [3, 2.2, 4], near: 0.01, far: 1000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        className="!absolute inset-0"
      >
        <Environment resolution={256} environmentIntensity={envIntensity}>
          <Lightformer
            form="rect"
            intensity={1.6}
            color="#ffe2c4"
            position={[0, 5, -6]}
            scale={[10, 4, 1]}
          />
          <Lightformer
            form="rect"
            intensity={1}
            color="#c45428"
            position={[-6, 1, 0]}
            rotation-y={Math.PI / 2}
            scale={[8, 3, 1]}
          />
          <Lightformer
            form="rect"
            intensity={0.7}
            color="#e8aa00"
            position={[6, 2, 2]}
            rotation-y={-Math.PI / 2}
            scale={[6, 3, 1]}
          />
          <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[0, 6, 4]} scale={3} />
        </Environment>
        <ambientLight intensity={0.15} />
        <directionalLight position={[5, 8, 5]} intensity={1.6} color="#ffe2c4" />
        <directionalLight position={[-6, 3, -4]} intensity={0.9} color="#c45428" />

        {model && (
          <Bounds fit clip observe margin={1.3}>
            <primitive object={model.scene} />
            <BoundsReset trigger={resetKey} />
          </Bounds>
        )}
        {model && <Animator root={model.scene} clips={model.animations} active={clip} />}
        {grid && (
          <Grid
            infiniteGrid
            cellSize={0.25}
            sectionSize={1}
            cellColor="#3c2e26"
            sectionColor="#6e2a1c"
            fadeDistance={24}
            fadeStrength={1.5}
          />
        )}
        <OrbitControls makeDefault enableDamping autoRotate={autoRotate} autoRotateSpeed={1.2} />
      </Canvas>

      {model && (
        <div className="forge-panel absolute bottom-4 left-4 z-10 flex items-center gap-0.5 rounded-md p-1 shadow-lg backdrop-blur">
          <ToolButton active={wireframe} onClick={() => setWireframe((v) => !v)} label="Wireframe">
            <Shapes className="size-4" />
          </ToolButton>
          <ToolButton active={grid} onClick={() => setGrid((v) => !v)} label="Ground grid">
            <Grid3x3 className="size-4" />
          </ToolButton>
          <ToolButton
            active={autoRotate}
            onClick={() => setAutoRotate((v) => !v)}
            label="Auto-rotate"
          >
            <Rotate3d className="size-4" />
          </ToolButton>
          <ToolButton
            active={envIntensity > 1}
            onClick={() => setEnvIntensity((v) => (v >= 2 ? 0.5 : v + 0.5))}
            label={`Lighting ${envIntensity}×`}
          >
            <Sun className="size-4" />
          </ToolButton>
          <ToolButton onClick={() => setResetKey((k) => k + 1)} label="Reset camera">
            <RotateCcw className="size-4" />
          </ToolButton>
          {model.animations.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-iron-500" />
              <DropdownMenu>
                <DropdownMenuTrigger className="h-7 max-w-48 truncate rounded-sm px-2 text-[11px] text-bone/80 hover:bg-iron-700 hover:text-gold">
                  {clip || "No animation"}
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-80 overflow-y-auto">
                  <DropdownMenuRadioGroup value={clip} onValueChange={setClip}>
                    <DropdownMenuRadioItem value="">No animation</DropdownMenuRadioItem>
                    {model.animations.map((a) => (
                      <DropdownMenuRadioItem key={a.uuid} value={a.name}>
                        {a.name || "(unnamed)"}
                        <span className="ml-auto font-mono text-[10px] text-dust">
                          {a.duration.toFixed(1)}s
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      )}

      {stats && (
        <div className="forge-panel absolute top-4 left-4 z-10 rounded-md px-3 py-2 font-mono text-[10.5px] leading-relaxed text-dust">
          <Stat label="meshes" value={stats.meshes} />
          <Stat label="triangles" value={stats.triangles} />
          <Stat label="vertices" value={stats.vertices} />
          <Stat label="materials" value={stats.materials} />
          {model && model.animations.length > 0 && (
            <Stat label="clips" value={model.animations.length} />
          )}
        </div>
      )}
    </Stage>
  );
}

/** Scales the model to roughly two units tall-or-wide and rests it on the ground plane. */
function normalize(root: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2 / Math.max(size.x, size.y, size.z, 1e-6);
  root.scale.multiplyScalar(scale);
  root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
}

function BoundsReset({ trigger }: { trigger: number }) {
  const bounds = useBounds();
  useEffect(() => {
    if (trigger > 0) bounds.refresh().clip().fit();
  }, [trigger, bounds]);
  return null;
}

function Animator({
  root,
  clips,
  active,
}: {
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  active: string;
}) {
  const mixer = useMemo(() => new THREE.AnimationMixer(root), [root]);
  useEffect(() => {
    mixer.stopAllAction();
    const clip = clips.find((c) => c.name === active);
    if (clip) mixer.clipAction(clip).reset().play();
    return () => {
      mixer.stopAllAction();
    };
  }, [mixer, clips, active]);
  useFrame((_, dt) => mixer.update(dt));
  return null;
}

function ToolButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-sm transition-colors",
        active ? "bg-rust/50 text-gold" : "text-bone/75 hover:bg-iron-700 hover:text-gold",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-6">
      <span>{label}</span>
      <span className="text-bone/85 tabular-nums">{value.toLocaleString()}</span>
    </div>
  );
}
