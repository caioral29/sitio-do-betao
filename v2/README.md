# O Sítio do Betão — versão 2 (gráficos novos) 🥥🎣

Mesma jogabilidade da versão 1, com visual refeito no estilo "jogo de vida":
cenário liso e cheio de vegetação, iluminação suave, personagem com proporções humanas.

**Jogar:** https://sitio-do-betao-v2.vercel.app/ · (versão 1: https://sitio-do-betao.vercel.app/)

## Rodar localmente
```bash
cd v2
npm install
npm run dev      # http://localhost:5190
npm run build    # gera dist/
```

## O que mudou no gráfico
- **Motor:** three.js + pós-processamento (`postprocessing`): oclusão de ambiente N8AO, bloom, SMAA,
  tone mapping ACES e vinheta; iluminação de céu real (HDRI) e sombras suaves que seguem o Betão.
- **Chão:** terreno contínuo com grama texturizada, trilhas de terra pintadas, terra vermelha, margens do rio em rampa,
  morros com mata em volta e montanhas ao fundo. Capim em tufos com vento.
- **Vegetação:** árvores frondosas (copas de folhas pintadas + vento), coqueiros com palhas curvas, bananeiras,
  samambaias, flores (gazânia e vinca), forração e pedras com musgo (modelos CC0).
- **Construções:** madeira, reboco, pedra e telha colonial com textura real; venezianas, portas almofadadas,
  capelinha com arco, deck e ponte com guarda-corpo branco.
- **Betão:** corpo inteiro novo (cabeça esculpida, olhos, sobrancelhas, barba por fazer, cabelo grisalho nas têmporas),
  regata preta, bermuda cargo e chinelo; joelhos e cotovelos dobram.
- **Fiat Strada:** carroceria arredondada com pintura brilhante, rodas de liga, capota marítima, santo antônio.
- **Água, céu e interface:** rio com reflexo e espuma, nuvens fofas no céu, HUD em vidro fosco.
- **Desempenho:** qualidade adaptativa (baixa resolução/oclusão se o FPS cair). `?hq` força a qualidade máxima.

## Estrutura (o que é novo)
- `src/assets.js` carrega texturas/modelos/HDRI · `src/kit.js` materiais, caixas arredondadas, lotes
- `src/flora.js` árvores, coqueiros, bananeiras, capim, plantas · `src/terrain.js` chão, rio, estrada
- `scripts/shots.mjs` prints automáticos (`node scripts/shots.mjs <pasta> tour face night drive ...`)
- Créditos dos assets: `public/assets/CREDITS.md`
