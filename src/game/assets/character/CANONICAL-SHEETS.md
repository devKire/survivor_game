# Sheets canônicas

Quatro `source.png` de 2048×2048, PNG RGBA, grade 8×8, células 256×256.
Colunas: south, southwest, west, northwest, north, northeast, east, southeast.
Linhas: idle0, walk0, walk1, walk2, walk3, attack0, attack1, attack2.
Todos os 64 slots têm conteúdo: 8 idle, 32 walk, 24 attack.

- Fontes 1254×1254 preservadas, sem alteração, como `source.reference.png`.
- Nara e Ivo possuem sete faixas: `walk3` repete exatamente `walk2`, conforme autorização do usuário.
- Orin e Sena usam oito faixas originais. A semântica das direções é a informada pelo usuário.
- Escala **1 em todos os personagens**: nenhuma pose foi redimensionada, interpolada ou redesenhada.
- Regiões semânticas primeiro; limites de faixa/coluna ajustados por vales de alpha; bbox inclui todo alpha não zero da região. Nenhum uso de connected-components.
- Pés estimados pela silhueta opaca na parte central inferior; transladados para aproximadamente (128,220), com margem de pelo menos 3px no destino.

## Limitação visual encontrada

As quatro sheets foram revisadas com alpha composto sobre fundo sólido.
Visualizadores que ignoram o alpha podem mostrar retângulos coloridos nos recortes;
esses retângulos não aparecem quando a transparência é aplicada corretamente.

Após ajustar os limites por vales de alpha, **quatro recortes da Sena** ainda têm
contato significativo com a fronteira da região original: attack1 em south,
southwest, northwest e southeast. O JSON identifica esses casos com
`requiresVfxReview`. Sua separação integral não é certificada: brilhos e poses
estão muito próximos na fonte. Não foi pintado, apagado ou reconstruído VFX.
Nenhum recorte sofre corte adicional ao ser colocado na célula 256×256.

## Reprodução e validação

`npm run assets:characters:canonicalize` reconstrói a partir dos backups.

`npm run assets:characters:validate` confere dimensões, RGBA, 64 células não vazias,
limites dos recortes no destino, preservação da quantidade de pixels alpha por célula
e igualdade dos pixels com a reconstrução determinística.
O JSON `canonicalization-report.json` registra hashes, escala, regiões, bbox, pivots,
linhas repetidas e contatos de alpha nas fronteiras para revisão. Contato na fronteira
é um indicador; sua ausência não prova isolamento de brilhos semitransparentes.

O runtime não foi alterado nesta etapa.
