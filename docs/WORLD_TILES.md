# Terreno visual e atlases

## Pipeline

`npm run assets:tiles:metadata` descobre sources recursivamente, calcula SHA-256,
valida 8×8 e grava sidecars, manifest e imports estáticos Next.
`npm run assets:tiles:validate` recalcula e compara os arquivos gerados.
`npm run assets:tiles:qa` grava as 24 pranchas indexadas em `artifacts/tiles/qa`.
Nenhum comando sobrescreve PNGs. O runtime importa 23 imagens canônicas:
`beast_damage/source-b.png` é idêntico a `source-a.png` e permanece preservado.
Ambos os sources de forest são distintos e utilizados.

Os nomes históricos send, volvano e trees/trees foram normalizados para sand,
volcano e trees/living; o manifest registra essas mudanças.
Cada source de 1254×1254 contém 64 slots. A detecção usa vales de alpha nos props
e separadores escuros próximos das posições esperadas no ground. Não pressupõe
slots de 256px. Os casos revisados estão em `scripts/tile-layout-overrides.json`,
com hash obrigatório: trocar a imagem invalida a revisão. Confiança menor que .8
interrompe o pipeline antes da escrita. Confiança é um indicador heurístico,
não uma probabilidade estatística. Coordenadas locais refinadas também participam
na avaliação. Ground tem inset de 3px para evitar linhas do grid.

O anchor usa a base do maior componente opaco conectado, descartando a cauda
inferior de pixels e fragmentos desconectados. Yellow bbox e cruz rosa no QA
permitem revisar a aproximação. Não é uma análise semântica de pés/raízes.
Slots com contato excessivo nas bordas têm weight=0 e não são usados:
beast_damage 50,51,58,59; cave 27; ruins 24,25. Precisam de revisão manual
antes de reativação. O fallback escolhe outro slot válido da mesma família.
Tags incertas continuam generic; nenhuma tag visual concede dano ou colisão.

## Runtime

`world-biomes.ts` concentra perfis e pesos. Regiões Voronoi com macro-células
1152 usam hashString/mulberry32; patches de chão medem 192 unidades e chunks
visuais 768. Bordas compartilham descritores e o raster faz sobreposição com
máscaras suaves, sem supor que existam peças de transição compatíveis.
Ruins favorece arquitetura, floresta e pedra; gardens favorece floresta e pântano.
Cave/mine/volcanic_cave/volcano estão disponíveis como perfis, sem novos mapas.

Props usam candidatos com jitter, densidade por bioma, clareiras e exclusão da
origem (210 unidades) e das estruturas próximas. Slots, escala e posição têm
hash próprio. O cache é independente de World.chunks, inclusive no RemoteGame.
A progressão visual antecipa bossSchedule em 55s, atinge o máximo no evento e
regride em 55s. Chão recebe camadas dead/corrupted; árvores passam por mortas e
petrificadas e algumas pedras por formações corrompidas, com limiares estáveis e
fade. Não depende de vida/morte de bosses e não altera o WaveDirector.

`tile-art.ts` valida metadata uma vez. `TileRenderer` carrega uma Image por URL
sob demanda; preserva smoothing/alpha, ancora props e retorna false em falhas.
`WorldTileRenderer` cacheia descritores e rasters em meia resolução (384px),
com até 36 rasters (~20.25 MiB), descarte distante e até dois bakes por frame.
Imagens decodificadas têm cache separado e não estão incluídas nesse limite.
Props são desenhados antes das entidades para priorizar leitura; não há y-sort
global nem oclusão de inimigos por copas. Há fade próximo ao jogador.

Column/wall/ruin/platform usam ruins; stone usa rocks; tree segue o bioma;
rift usa corruption e thorn swamp. Interativos sem correspondência mantêm
arte legacy. Os anéis dos hazards continuam usando o raio autoritativo.
Structures, IDs, r, hp, worldVersion, worldChanges, saves e snapshots não mudam.
Mapas competitivos com world.profile continuam com a composição legacy.
RemoteGame usa a duração já recebida no snapshot para reconstruir bossSchedule.

## QA da cena

Com `npm run dev -- --port 3400`, execute `node scripts/qa-world-tiles.mjs`
(Chrome instalado). Produz screenshots e tempos de draw em artifacts/tiles/scenes,
incluindo todos os grounds, famílias de props, 500 inimigos, corrupção, cliente
remoto e imagens bloqueadas. O QA compara chunks compartilhados por coordenada;
a ordem do cache e os chunks fora da tela podem variar com o histórico da câmera.

A rota `/offline?tiles=forest` (ou outro bioma, props, combat, remote) existe
somente em development. `&time=230` mostra o aviso ambiental, `&x=...&y=...`
permite explorar outras regiões. As cenas não persistem saves.
Medições do cenário pausado avaliam renderização, não um benchmark completo da
simulação, GPU ou rede. Confirme legibilidade em hardware alvo antes de aumentar
densidade. Os PNGs podem conter água/magma decorativos: somente hazards explícitos
e World.isWater têm autoridade de gameplay.
