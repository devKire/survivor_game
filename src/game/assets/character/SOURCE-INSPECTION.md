# Inspeção dos assets — 2026-09-26

> Histórico das fontes anteriores (1536/1448px), substituídas pelo usuário.
> Para os arquivos atuais, consulte `CANONICAL-SHEETS.md` e
> `canonicalization-report.json`. As conclusões abaixo não se aplicam às novas fontes.

Os oito PNG foram abertos. As quatro fontes têm RGBA, com muitos pixels de
alpha baixo entre poses. Nenhum arquivo-fonte foi alterado.

| Fonte | Dimensões | Poses visíveis por faixa: topo / caminhada / ataque |
| --- | --- | --- |
| Nara | 1536 × 1024 | 8 / 3 linhas de 14 / 3 linhas de 8 |
| Orin | 1448 × 1086 | 8 / 3 linhas de 15 / 3 linhas de 8 |
| Ivo | 1448 × 1086 | 8 / 3 linhas de 10 / 3 linhas de 8 |
| Sena | 1536 × 1024 | 8 / 3 linhas de 14 / 3 linhas de 8 |

Essas contagens são observações visuais, **não frames validados de animação**.
Há poses de frente/lado repetidas. Não foi possível confirmar a correspondência
das colunas com S, SW, W, NW, N, NE, E, SE, nem o agrupamento da caminhada.
Quantidades diferentes são permitidas, mas não determinam sozinhas esse mapeamento.

A projeção de alpha > 128 encontra apenas 5 faixas contínuas na Nara,
7 no Orin, 5 no Ivo e 5 na Sena: efeitos encostam em faixas vizinhas.
Recortar por ilhas de alpha separaria efeitos do corpo. Uma grade uniforme de
8 colunas cortaria os frames de caminhada. Não há uma convenção compartilhada
confirmada que permita gerar os quatro atlas com segurança.

## Pendência para o pipeline

Fornecer sheets com faixas identificáveis por animação/direção e slots completos
(corpo + efeitos), ou a convenção do exportador que explique os grupos atuais.
Não são necessárias coordenadas medidas frame a frame. Limites de blocos e ordem
de direções bastam quando os slots são regulares.

Conforme a regra de falhar em caso de ambiguidade, não foram gerados `atlas.png`
nem `atlas.json`. O renderer de gameplay permanece intacto. Pivot, direção,
idle/walk e attack só podem ser validados depois de resolver esse mapeamento.

## Parte independente integrada

Portraits por import estático em `src/game/client/character-art.ts`, separados
dos dados de gameplay. `CharacterPreview` ganhou apresentação `portrait` para
cards e mantém sua prévia animada de cosméticos e fallback vetorial. Cards de
Arena, lobby, Coleção e seleção de Expedição usam os novos portraits, com proporção
preservada. Não foram criadas skins nem reinterpretadas as sprites existentes.
