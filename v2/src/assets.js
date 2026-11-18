import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Texturas e modelos CC0 (Poly Haven) — ver public/assets/CREDITS.md
const BASE = '/assets/';
const TEX = [
  'grass_col', 'dirt_col', 'dirt_nrm', 'redsoil_col', 'deck_col', 'deck_nrm', 'deck_rgh', 'wood_col', 'wood_nrm', 'wood_rgh',
  'bark_col', 'bark_nrm', 'palmbark_col', 'palmbark_nrm', 'roof_col', 'roof_nrm', 'roof_rgh', 'plaster_col', 'plaster_nrm',
  'asphalt_col', 'asphalt_nrm', 'rock_col', 'rock_nrm', 'stonetile_col', 'stonetile_nrm',
];
const MODELS = ['fern_02', 'flower_gazania', 'periwinkle_plant', 'rock_moss_set_01', 'rock_moss_set_02', 'planter_pot_clay', 'celandine_01'];

export const assets = { tex: {}, models: {}, env: null, maxAniso: 8 };

export async function loadAssets(renderer, onProgress = () => {}) {
  const total = TEX.length + MODELS.length + 1;
  let done = 0;
  const tick = () => onProgress(++done / total);
  assets.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const tl = new THREE.TextureLoader();
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);

  const texJobs = TEX.map((name) => tl.loadAsync(`${BASE}tex/${name}.jpg`).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = assets.maxAniso;
    if (name.endsWith('_col')) t.colorSpace = THREE.SRGBColorSpace;
    assets.tex[name] = t;
    tick();
  }));
  const modelJobs = MODELS.map((name) => gl.loadAsync(`${BASE}models/${name}.glb`).then((g) => {
    assets.models[name] = g.scene;
    tick();
  }));
  const envJob = new RGBELoader().loadAsync(`${BASE}hdri/day.hdr`).then((hdr) => {
    const pm = new THREE.PMREMGenerator(renderer);
    assets.env = pm.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pm.dispose();
    tick();
  });
  await Promise.all([...texJobs, ...modelJobs, envJob]);
  return assets;
}

// cópia de uma textura com repetição própria (a imagem é compartilhada na GPU)
export function tex(name, rx = 1, ry = rx) {
  const t = assets.tex[name].clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// pega as malhas de um nó do modelo (variações vêm lado a lado no arquivo)
export function modelParts(model) {
  const parts = [];
  const root = assets.models[model];
  root.updateMatrixWorld(true);
  for (const child of root.children) {
    const meshes = [];
    child.traverse((o) => {
      if (o.isMesh) meshes.push(o);
    });
    if (!meshes.length) continue;
    parts.push({ name: child.name, meshes, origin: child.position.clone() });
  }
  return parts;
}
