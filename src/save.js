const KEY = 'sitio-do-betao-v1';

export const ACHIEVEMENTS = [
  { id: 'firstFish', name: 'Primeira fisgada', desc: 'Pesque seu primeiro peixe', icon: '🎣' },
  { id: 'fish10', name: 'Pescador de fim de semana', desc: 'Pesque 10 peixes', icon: '🐟' },
  { id: 'allFish', name: 'Mestre do rio', desc: 'Pesque todas as espécies', icon: '🏆' },
  { id: 'dourado', name: 'Ouro do rio', desc: 'Pesque um Dourado', icon: '✨' },
  { id: 'chinelo', name: 'Achado não é roubado', desc: 'Pesque um chinelo perdido', icon: '🩴' },
  { id: 'nightFish', name: 'Pescaria noturna', desc: 'Pesque algo depois que escurecer', icon: '🌙' },
  { id: 'coco10', name: 'Coqueiro sacudido', desc: 'Junte 10 cocos', icon: '🥥' },
  { id: 'cocoGold', name: 'Coco de ouro', desc: 'Encontre um coco dourado', icon: '🌟' },
  { id: 'drink', name: 'Água de coco geladinha', desc: 'Beba uma água de coco', icon: '🧃' },
  { id: 'dance60', name: 'Pé de valsa', desc: 'Dance por 60 segundos no total', icon: '🕺' },
  { id: 'allDances', name: 'Repertório completo', desc: 'Dance forró, eletrônico e axé', icon: '🎶' },
  { id: 'sunset', name: 'Contemplativo', desc: 'Veja o pôr do sol sentado num banco', icon: '🌅' },
  { id: 'benches', name: 'Turista de banco', desc: 'Sente nos 3 bancos do sítio', icon: '🪑' },
  { id: 'hammock', name: 'Vida boa', desc: 'Tire um cochilo na rede', icon: '😴' },
  { id: 'knock', name: 'Ô de casa!', desc: 'Chame alguém na casa', icon: '🏠' },
  { id: 'explorer', name: 'Explorador', desc: 'Atravesse a ponte e leia a placa', icon: '🧭' },
  { id: 'drive', name: 'Pé na estrada', desc: 'Saia com a Strada pelo portão até a estrada', icon: '🛻' },
];

export function loadSave() {
  const def = {
    coconuts: 0, coconutsTotal: 0, golden: 0, fish: {}, fishTotal: 0, dance: 0, dances: [], benches: [],
    ach: {}, hour: 15.5, drinks: 0,
  };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...def, ...s };
  } catch (e) { /* save corrompido */ }
  return def;
}

export function writeSave(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch (e) { /* sem storage */ }
}

export function resetSave() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) { /* sem storage */ }
}
