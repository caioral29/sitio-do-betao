# O Sítio do Betão 🥥🎣

Jogo 3D de exploração no navegador (Three.js). O Betão passa o dia de folga no sítio:
pesca no rio, sacode os coqueiros para colher coco, senta nos bancos para ver o pôr do sol
e dança forró, eletrônico e axé.

## Como jogar
- **Duplo clique em `Jogar.command`** (macOS) ou rode:
  ```bash
  npm install
  npm run dev      # abre em http://localhost:5173
  ```
- Para publicar: `npm run build` gera a pasta `dist/` (qualquer hospedagem estática, ex.: Vercel/Netlify).

## Controles
| Tecla | Ação |
|---|---|
| WASD / setas | andar |
| Shift | correr |
| Espaço | pular |
| E | interagir (sentar, deitar na rede, pescar, sacudir coqueiro, portão, placa, chamar na casa) |
| Q | dançar / trocar o ritmo |
| C | beber água de coco (dá energia para correr mais rápido) |
| J | diário (peixes, conquistas, estatísticas) |
| Mouse arrastar / roda | girar câmera / zoom |
| M | som · H esconde a ajuda · Esc pausa |

### Dirigindo a Strada 🛻
| Tecla | Ação |
|---|---|
| E (perto da Strada) | entrar / sair (só sai parado) |
| W / S | acelerar / frear e dar ré |
| A / D | virar |
| Espaço | freio de mão |
| V (ou botão 👀 no HUD) | alterna visão de 1ª pessoa (do motorista) e 3ª pessoa |
| Q | buzina |
| Mouse arrastar | olhar em volta (a câmera volta sozinha pra posição de dirigir) |

No celular aparecem joystick e botões na tela.

## O que tem
- **Pesca**: 7 espécies brasileiras (Lambari, Tilápia, Traíra, Pacu, Bagre, Tucunaré, Dourado) + um chinelo perdido.
  Raridade muda com a hora (bagre e traíra à noite, tucunaré e dourado no amanhecer/entardecer).
  Minigame de tensão: segure para puxar, solte quando o peixe correr.
- **Coqueiros**: cocos caem com física, rebrotam com o tempo; 7% de chance de coco dourado.
- **Bancos**: sentado, o tempo passa 16× mais rápido para ver o pôr do sol.
- **Rede**: entre os dois coqueiros perto da entrada; deitado ela balança, o tempo acelera e depois de um tempo o Betão cochila.
- **Dança**: 3 estilos com música sintetizada, notas musicais e luz de balada à noite.
- **Ciclo dia/noite**: sol nasce no leste, estrelas, lua, vaga-lumes, janelas e postes acendem.
- **Vida**: pássaros, borboletas, peixes pulando, carros passando (e buzinando se o Betão estiver na estrada).
- **Fiat Strada**: fica estacionada atrás do portão. Dá pra rodar pelo sítio, sair pelo portão (abre sozinho com o
  "controle remoto" quando o carro chega perto) e andar pela estrada. Câmera em terceira pessoa atrás do carro,
  faróis à noite, luz de freio e de ré, os carros da estrada freiam e buzinam. A Strada fica onde você deixou.
- **Visão do motorista (1ª pessoa)**: volante com emblema FIAT girando com as mãos do Betão, painel com velocímetro e
  conta-giros funcionando, visor com a marcha, câmbio de 5 marchas que mexe, freio de mão, rádio "Sítio FM",
  e retrovisores (interno e externos) que mostram de verdade o que está atrás. A escolha de câmera fica salva.
- 17 conquistas, progresso salvo automaticamente no navegador.

## Estrutura
- `src/world.js` — cenário (casa, deck, ponte, cercas, árvores, coqueiros, morros)
- `src/character.js` — modelo do Betão · `src/player.js` — movimento e animações
- `src/fishing.js`, `src/coconuts.js`, `src/hammock.js` — mecânicas · `src/audio.js` — sons e músicas (WebAudio)
- `src/sky.js` — ciclo dia/noite · `src/life.js` — vida ambiente · `src/ui.js` — interface
- `referencias/` — imagens e fotos usadas como referência
- `src/strada.js` — a Fiat Strada (modelo voxel, física de direção, colisão, câmbio)
- `src/cockpit.js` — interior da Strada e visão de 1ª pessoa (painel, volante FIAT, retrovisores)
- `scripts/test-shot.mjs` — teste automatizado com prints (`node scripts/test-shot.mjs <pasta> play`)
- `scripts/drive-test.mjs` / `scripts/fpv-test.mjs` / `scripts/car-shots.mjs` — testes da Strada (3ª e 1ª pessoa) e prints do modelo (`GAME_URL=http://localhost:5173/ node scripts/drive-test.mjs <pasta>`)
