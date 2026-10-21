import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { fileUrl } from "../api";
import type { Asset } from "../types";
import { mtlCandidates } from "./mtl.ts";

export interface LoadedModel {
  object: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

const defaultMaterial = () => new THREE.MeshStandardMaterial({ color: 0xb8c2d6, roughness: 0.7, metalness: 0.05 });

export async function loadModel(asset: Asset): Promise<LoadedModel> {
  const url = fileUrl(asset.path);
  switch (asset.ext) {
    case "glb":
    case "gltf": {
      const g = await new GLTFLoader().loadAsync(url);
      return { object: g.scene, animations: g.animations };
    }
    case "fbx": {
      const o = await new FBXLoader().loadAsync(url);
      return { object: o, animations: o.animations };
    }
    case "obj": {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Can't read ${asset.path}`);
      const text = await res.text();
      const loader = new OBJLoader();
      const textures = new THREE.LoadingManager();
      const texturesDone = new Promise<void>((r) => (textures.onLoad = r));
      let hasTextures = false;
      textures.onStart = () => (hasTextures = true);
      const materials = await loadMtl(mtlCandidates(asset.path, text));
      if (materials) {
        materials.setManager(textures);
        materials.preload();
        loader.setMaterials(materials);
      }
      const o = loader.parse(text);
      if (!materials)
        o.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = defaultMaterial();
        });
      // Thumbnails render once, so wait for the textures (failed ones count as done too).
      if (hasTextures) await texturesDone;
      return { object: o, animations: [] };
    }
    case "stl": {
      const geo = await new STLLoader().loadAsync(url);
      geo.computeVertexNormals();
      return { object: new THREE.Mesh(geo, defaultMaterial()), animations: [] };
    }
    default:
      throw new Error(`Can't preview .${asset.ext} models`);
  }
}

/** The first .mtl that loads, or null: a missing or broken one just leaves the OBJ with the neutral material. */
async function loadMtl(paths: string[]): Promise<MTLLoader.MaterialCreator | null> {
  for (const p of paths) {
    try {
      // Textures resolve against the .mtl's folder, which fileUrl keeps as real "/" segments.
      const m = await new MTLLoader().loadAsync(fileUrl(p));
      if (Object.keys(m.materialsInfo).length) return m;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  scene.add(key);
}

/** Points the camera at the object from a three-quarter angle so it fills the view. Returns the object's radius. */
export function frame(camera: THREE.PerspectiveCamera, object: THREE.Object3D, target?: THREE.Vector3): number {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = sphere.radius || 1;
  const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.copy(sphere.center).add(new THREE.Vector3(1, 0.7, 1).normalize().multiplyScalar(dist * 1.05));
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);
  target?.copy(sphere.center);
  return r;
}

export function dispose(object: THREE.Object3D) {
  object.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}

export function stats(object: THREE.Object3D) {
  let vertices = 0;
  let triangles = 0;
  object.traverse((c) => {
    const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!g?.attributes?.position) return;
    vertices += g.attributes.position.count;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return { vertices, triangles: Math.round(triangles) };
}
