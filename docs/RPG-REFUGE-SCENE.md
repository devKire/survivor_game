# Cena do Refúgio v1

`src/game/content/rpg/refuge.ts`: `obelisk-refuge`, versão 1, 1200×900 unidades, spawn (600,620). Não usa WorldVersion, world seed, chunks de combate ou RunSnapshot. Conteúdo estático separado dos mundos procedurais.

| ID após `refuge:` | Área | Coordenadas | Colisão / interação |
|---|---|---|---|
| obelisk | Praça do Obelisco | 600,350 | 34 / 100 |
| characters | Personagens | 310,650 | 26 / 85 |
| arsenal | Arsenal | 400,365 | 30 / 85 |
| stash | Depósito | 820,365 | 28 / 85 |
| board | Quadro de expedições | 850,650 | 25 / 85 |
| exit | Saída | 600,810 | 24 / 90 |

Ruínas laterais (160,270)/(1040,270), cristais junto à praça (520,350)/(680,350), árvores ao norte e rochas laterais ao sul possuem IDs próprios. Não se renomeiam estruturas de Survivor. Raio do jogador 13; velocidade local 190 unidades/s; diagonal normalizada; dt limitado a 50ms; subpassos de até 4 unidades e deslizamento por eixo. Bounds impedem saída. Seleção escolhe alvo conhecido mais próximo, desempate estável por ID.

## Reutilização

WorldRenderer completo exige mundo/run e agrega desenho de combate. A cena usa diretamente suas primitivas existentes `TileRenderer`, `resolveGroundAtlas`, `resolvePropAtlas` e `CharacterSpriteRenderer`. Nenhuma segunda implementação de leitura dos atlases. Player existe somente como adaptador visual; não recebe update de armas, XP ou movimento de combate. Nenhuma modificação em `Player.recalculate()`.

Canvas único; instanciação lazy em Client Component; RAF único por cena; cinco listeners nativos com AbortController; um ResizeObserver; cancelamento e dispose idempotente. Tab oculta e blur limpam input. Cena pausada durante diálogo. Resize só escreve dimensões quando mudam; DPR limitado a 2. Câmera acompanha e respeita bounds, com margem visual para o norte. Cache de imagens é o cache global limitado pelos 23 atlases e quatro personagens existentes; a cena não cria caches ilimitados. Amostras de tempo limitadas a 240. Terreno estático em um único raster offscreen de 1200×900 (~4,12 MiB), recriado somente na mudança de geração das imagens e descartado ao sair.

WASD/setas, oito direções, idle/walk canônicos, E/contexto, Escape. Controle virtual em oito direções com pointer capture/cancel e teclado; nenhuma dependência de hover. Dialog nativo retém foco e devolve ao Canvas ao fechar. Serviços alternativos acessíveis, orientação espacial textual e atualização explícita do perfil.

## Assets auditados

Quatro `src/game/assets/character/{nara,orin,ivo,sena}/source.png`, 2048²/células256/oito direções, usados sem alteração pelo renderer canônico. `tiles.manifest.json` e sidecars orientam seleção de chão forest/ruins e props ruins/crystals/trees_living/rocks; slots desabilitados continuam respeitados pelo resolver. Assets de combate não são extraídos ou sobrescritos.

Arte específica de serviços ainda não é canônica. Os desenhos vetoriais simples do Canvas são fallbacks temporários, não sprites finais. Se atlases não carregarem, terreno/props usam cores e silhuetas; se o sprite falhar, há marcador provisório. A falha não desabilita serviços.

| Asset pendente | Finalidade | Dimensão sugerida | Animação / direções | Paleta | Caminho futuro | Estado |
|---|---|---|---|---|---|---|
| Guardião | Recepção | célula128² | idle 4 frames / 4 | verde-pedra, ouro pálido | assets/rpg/refuge/guardian/source.png | fallback geométrico |
| Arsenalista | Equipamentos | célula128² | idle 4 / 4 | azul-petróleo, bronze | assets/rpg/refuge/armorer/source.png | fallback geométrico |
| Depositário | Armazenamento | célula128² | idle 4 / 4 | musgo, couro | assets/rpg/refuge/keeper/source.png | fallback geométrico |
| Orientador | Preparação | célula128² | idle 4 / 4 | cinza, teal | assets/rpg/refuge/guide/source.png | fallback geométrico |
| Fragmento estabilizado | Marco da praça | 256² | brilho 4 / 1 | pedra azul, verde luminoso | assets/rpg/refuge/obelisk/source.png | fallback geométrico |
| Cofre do Depósito | Guardar/retirar | 128² | fechado/aberto / 1 | pedra, bronze | assets/rpg/refuge/stash/source.png | fallback geométrico |
| Bancada do Arsenal | Equipamentos | 128² | estático / 1 | madeira, aço | assets/rpg/refuge/arsenal/source.png | fallback geométrico |
| Quadro | Expedições | 128² | estático / 1 | madeira, pergaminho | assets/rpg/refuge/board/source.png | fallback geométrico |
| Portal | Saída | 256² | brilho 4 / 1 | ruína, teal | assets/rpg/refuge/portal/source.png | fallback geométrico |
| Marco de personagens | Ficha | 128² | estático / 1 | pedra, verde | assets/rpg/refuge/characters/source.png | fallback geométrico |

Caminhos futuros relativos a `src/game/`; dimensões são recomendações para revisão artística, não um novo contrato de sprite sheet. Nenhuma imagem gerada ou substituída automaticamente.
