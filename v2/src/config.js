// Layout do sítio — todas as coordenadas em "blocos" (1 unidade = 1 tile do chão)
// x = leste, z = sul (a estrada fica no sul, o rio no norte)

export const CHAR_SCALE = 0.9;
export const HIP = 0.9; // altura do quadril no modelo (antes da escala)
export const SIT_LIFT = 0.1; // quadril acima do assento (espessura da coxa)

export const RIVER = {
  base: -10,
  amp: 1.2,
  freq: 0.11,
  phase: 0.6,
  hw: 2.4,
  waterY: -0.42,
  bedY: -1.3,
};

export const riverCenter = (x) => RIVER.base + Math.sin(x * RIVER.freq + RIVER.phase) * RIVER.amp;
export const isRiverTile = (ix, iz) => Math.abs(iz + 0.5 - riverCenter(ix + 0.5)) < RIVER.hw;
// v2: margem lisa (o chão não é mais em blocos)
export const isWater = (x, z) => Math.abs(z - riverCenter(x)) < RIVER.hw;

export const BRIDGE = { x: 2.2, z0: -13.0, z1: -5.4, w: 1.7, rise: 0.55 };
export const DECK = { x0: -7.6, x1: -2.2, z0: -8.4, z1: -4.6, y: 0.32 };
export const GATE = { x0: 6, x1: 10, z: 17.6 }; // portão dos carros
export const PED_GATE = { x0: 4.7, x1: 6 }; // portãozinho de pedestre (o pilar do meio é o GATE.x0)
export const FENCE_Z = 17.6;
export const NORTH_FENCE_Z = -17.3;
// a casa foi alongada pro sul (HOUSE_EXT) — anexo, canteiro e muro andaram junto
export const HOUSE_EXT = 2.5;
export const HOUSE_BOX = { x0: 11.1, x1: 23.5, z0: -3.8, z1: 11.5 + HOUSE_EXT };
export const BOUNDS = { x0: -28.5, x1: 28.5, z0: -16.8, z1: 25.0 };
export const SPAWN = { x: 8.6, z: 14.2, yaw: Math.PI };

export function onBridge(x, z, margin = 0) {
  return Math.abs(x - BRIDGE.x) < BRIDGE.w / 2 - margin && z > BRIDGE.z0 && z < BRIDGE.z1;
}
export function bridgeHeight(z) {
  const t = Math.min(Math.max((z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0), 0), 1);
  return 0.12 + BRIDGE.rise * Math.sin(Math.PI * t);
}
export function onDeck(x, z, margin = 0) {
  return x > DECK.x0 + 0.15 + margin && x < DECK.x1 - margin && z > DECK.z0 + 0.3 + margin && z < DECK.z1 - margin;
}
export function groundHeight(x, z) {
  if (onBridge(x, z)) return bridgeHeight(z);
  if (onDeck(x, z)) return DECK.y;
  if (z > 18.5 && z < 24.5) return -0.03;
  return 0;
}
export function surfaceAt(x, z) {
  if (onBridge(x, z) || onDeck(x, z)) return 'wood';
  if (z > 18.5 && z < 24.5) return 'road';
  return 'grass';
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// value noise 2D simples (determinístico)
function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
export function dampAngle(a, b, k, dt) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}
