import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

export type LoadedModel = {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
};

export type ModelFormat = "glb" | "gltf" | "obj" | "fbx";

/** Loads any supported model; `mtlUrl` is tried for OBJ files and silently skipped if absent. */
export async function loadModel(
  url: string,
  format: ModelFormat,
  opts: { mtlUrl?: string } = {},
): Promise<LoadedModel> {
  switch (format) {
    case "glb":
    case "gltf": {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const gltf = await loader.loadAsync(url);
      replaceFallbackMaterials(gltf.scene);
      return { scene: gltf.scene, animations: gltf.animations };
    }
    case "obj": {
      const loader = new OBJLoader();
      if (opts.mtlUrl) {
        const materials = await new MTLLoader().loadAsync(opts.mtlUrl).catch(() => null);
        if (materials) {
          materials.preload();
          loader.setMaterials(materials);
        }
      }
      const obj = await loader.loadAsync(url);
      return { scene: obj, animations: [] };
    }
    case "fbx": {
      const fbx = await new FBXLoader().loadAsync(url);
      return { scene: fbx, animations: fbx.animations };
    }
  }
}

/**
 * GLTFLoader gives material-less meshes a white, fully metallic default that mirrors the
 * environment and reads as a flat silhouette; swap it for a matte clay.
 */
function replaceFallbackMaterials(root: THREE.Object3D) {
  let clay: THREE.MeshStandardMaterial | null = null;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    const isFallback =
      !Array.isArray(mesh.material) &&
      m.isMeshStandardMaterial &&
      !m.map &&
      m.metalness === 1 &&
      m.roughness === 1 &&
      m.color.getHex() === 0xffffff;
    if (!isFallback) return;
    clay ??= new THREE.MeshStandardMaterial({ color: "#a89580", roughness: 0.72, metalness: 0 });
    mesh.material = clay;
    m.dispose();
  });
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      m.dispose();
    }
  });
}

export function modelStats(root: THREE.Object3D) {
  let meshes = 0;
  let triangles = 0;
  let vertices = 0;
  const materials = new Set<string>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const g = mesh.geometry;
    const verts = g.attributes.position?.count ?? 0;
    vertices += verts;
    triangles += g.index ? g.index.count / 3 : verts / 3;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) materials.add(m.uuid);
  });
  return { meshes, triangles: Math.round(triangles), vertices, materials: materials.size };
}
