import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { derivedUrl, relUrl, siblingUrl } from "@/lib/asset-url";
import { type AssetSummary, commands } from "@/lib/bindings";
import { qk } from "@/lib/query-keys";
import { ensureBlendExport } from "./blend";
import { useCaptureStore } from "./captureQueue";
import { disposeObject, loadModel, type ModelFormat } from "./loadModel";

const SIZE = 256;

/**
 * Headless worker: renders queued model/.blend files offscreen, one at a time,
 * and uploads the result as the asset's thumbnail.
 */
export function ThumbCapturer() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    let renderer: Renderer | null = null;

    const loop = async () => {
      while (!cancelled) {
        const next = useCaptureStore.getState().take();
        if (!next) {
          await waitForWork();
          continue;
        }
        renderer ??= new Renderer();
        await captureOne(next, renderer, qc);
      }
    };
    loop();

    return () => {
      cancelled = true;
      renderer?.dispose();
      wake();
    };
  }, [qc]);

  return null;
}

let wakeUp: (() => void) | null = null;
function wake() {
  wakeUp?.();
  wakeUp = null;
}
function waitForWork(): Promise<void> {
  return new Promise((resolve) => {
    wakeUp = resolve;
    const unsub = useCaptureStore.subscribe((s) => {
      if (s.queue.length > 0) {
        unsub();
        wake();
      }
    });
  });
}

async function captureOne(asset: AssetSummary, renderer: Renderer, qc: QueryClient) {
  const store = useCaptureStore.getState();
  store.setState(asset.id, "working");
  try {
    let url: string;
    let format: ModelFormat;
    if (asset.kind === "blend") {
      const status = await ensureBlendExport(asset.id);
      if (status.state === "noBlender") {
        store.setState(asset.id, "noBlender");
        return;
      }
      if (status.state !== "ready") throw new Error(status.message ?? "export failed");
      url = derivedUrl(asset, "glb");
      format = "glb";
    } else {
      url = relUrl(asset);
      format = asset.ext as ModelFormat;
    }
    const stem = asset.name.replace(/\.[^.]+$/, "");
    const model = await loadModel(url, format, { mtlUrl: siblingUrl(asset, `${stem}.mtl`) });
    const dataUrl = renderer.capture(model.scene);
    disposeObject(model.scene);
    await commands.saveModelThumb(asset.id, dataUrl);

    qc.setQueriesData<AssetSummary[]>({ queryKey: qk.assetsAll }, (list) =>
      list?.map((a) => (a.id === asset.id ? { ...a, thumbReady: true } : a)),
    );
    store.setState(asset.id, null);
  } catch (e) {
    console.warn(`thumbnail capture failed for ${asset.relPath}`, e);
    store.fail(asset.id, e instanceof Error ? e.message : String(e));
  }
}

class Renderer {
  private gl = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  private envTexture: THREE.Texture;

  constructor() {
    this.gl.setPixelRatio(1);
    this.gl.setSize(SIZE, SIZE, false);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.gl);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTexture;

    const key = new THREE.DirectionalLight("#ffd9b0", 1.6);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight("#c45428", 1.2);
    rim.position.set(-4, 2, -5);
    this.scene.add(key, rim, new THREE.AmbientLight("#3c2e26", 0.6));
  }

  capture(object: THREE.Object3D): string {
    const pivot = new THREE.Group();
    pivot.add(object);
    this.scene.add(pivot);

    const box = new THREE.Box3().setFromObject(object);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    object.position.sub(sphere.center);
    const radius = Math.max(sphere.radius, 1e-3);
    const fov = THREE.MathUtils.degToRad(this.camera.fov);
    const distance = (radius / Math.sin(fov / 2)) * 1.05;
    this.camera.position.copy(new THREE.Vector3(1, 0.65, 1.2).normalize().multiplyScalar(distance));
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.gl.setClearColor(0x000000, 0);
    this.gl.render(this.scene, this.camera);
    const url = this.gl.domElement.toDataURL("image/webp", 0.92);

    this.scene.remove(pivot);
    pivot.remove(object);
    return url;
  }

  dispose() {
    this.envTexture.dispose();
    this.gl.dispose();
  }
}
