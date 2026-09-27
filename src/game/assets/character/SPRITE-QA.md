# Diagnóstico visual dos sources canônicos

Revisão de 2026-09-27. Nenhum `source.png` foi alterado. As quatro sheets são
2048×2048 RGBA, com 64 células não vazias, e mantêm o pivot explícito (128,220).

## Reprodução local

```sh
node scripts/qa-character-sheets.mjs --bbox
node scripts/qa-character-sheets.mjs orin
# Ou: npm run assets:characters:qa -- --bbox
```

O script é uma ferramenta offline de desenvolvimento, fora do bundle e das rotas
da aplicação; recusa execução com `NODE_ENV=production`. Escreve em
`artifacts/character-sheets/qa/`, diretório ignorado pelo Git. Cada PNG mostra os
64 slots em escala nativa, direções, linhas de animação, crosshair rosa em
(128,220), ground horizontal ciano e, com `--bbox`, bbox amarelo de todo alpha
(incluindo VFX). Bbox não é detector de pés. Os arquivos sem/com bbox têm nomes
distintos. `validation.json` registra dimensões, conteúdo, hashes e indicadores
dos personagens selecionados na execução mais recente.

## Resultado por personagem

- **Nara:** igualdade pixel a pixel de `walk2` e `walk3` nas oito direções,
  autorizada anteriormente. Um ciclo `[1,2,3,4]` segura a última pose por dois
  intervalos. A limitação é do asset; usar temporariamente `[1,2,3]` não produz
  um quarto frame artístico. Sem contato de alpha registrado na fronteira original.
- **Orin:** quatro linhas walk distintas; todos os idle, walk e attack foram
  inspecionados na grade. Pés próximos da linha (128,220); não foi identificado
  corte ou troca estrutural de slots. Há variações de silhueta/cabelo/capa e
  direções frontais visualmente semelhantes no próprio desenho; não justificam
  compensação por offsets ou alteração da ordem declarada das direções.
- **Ivo:** mesma duplicação exata `walk2`/`walk3` de Nara. Pés próximos do pivot
  nos recortes inspecionados; mudanças de arma, capa e VFX pertencem à arte.
  Sem contato de alpha registrado na fronteira original.
- **Sena:** quatro linhas walk distintas. Corpo/halo diminuem visivelmente nas
  linhas attack em comparação com idle/walk. Isso já está no source: escala
  canônica igual a 1 em todos os frames. Como referência, bbox total em south:
  idle0 177 px de altura; walk0 167; attack0 145; attack1 129; attack2 139.
  Esses bboxes incluem VFX e não medem o corpo isoladamente. Alterar o ground
  transform não corrige essa diferença artística. Os 18 contatos de fronteira
  abaixo indicam risco no recorte original; quatro exigem revisão explícita.

A inspeção incluiu idle south/west/north e todos os walk/attack das quatro
direções cardinais, além da grade completa. O pivot é fixo; variações do desenho
dentro da célula permanecem. A grade permite revisar o asset sem movimento de
câmera, interpolation ou relógio de animação. Transições temporais e conversão
para o ground do mundo são responsabilidade dos testes focados do renderer.

## Correções de runtime

- A sombra já usa `player.y + 16`; agora `groundOffsetY = 16` leva o pivot
  interno (128,220) a esse mesmo ponto. Posição, hitbox e sombra não mudaram.
- `Player.dx/dy` conservam a última direção mesmo parado, inclusive para armas.
  Portanto não são velocidade. O jogador local fornece o vetor de entrada ao
  estado visual; os clientes de rede reutilizam o vetor com os bloqueios de
  foco/vida/estado já existentes. Nenhum valor volta para gameplay/prediction.
- Sem vetor de movimento explícito, o remoto usa deslocamento por segundo
  apenas para detectar movimento (entrada 8, saída 4 unidades/s, tolerância
  de 100 ms). A direção vem de `dx/dy`; deslocamento só orienta se não houver
  direção utilizável. Pequenas correções ainda podem ativar walk no remoto,
  mas não viram sua orientação quando há um vetor de direção válido.
- Walk começa na primeira linha ao sair de idle e mantém fase ao mudar de
  direção. Nara/Ivo usam `[1,2,3]`; Orin/Sena mantêm `[1,2,3,4]`.
- `attackSeq` continua sendo consumido; novos disparos durante um ciclo não
  reiniciam a linha 5. As linhas 5,6,7 terminam uma vez e retornam a walk/idle.
- Imagem fora de 2048×2048 falha no cache e usa o desenho legacy. O aviso de
  dimensão é emitido uma vez por URL, somente em desenvolvimento.

## Sena: contatos na fronteira da região original

Valores exatos de `canonicalization-report.json`. `boundaryAlphaPixels` conta
contatos com alpha ≥128; `requiresVfxReview` é true a partir de 8 contatos.
Contato não prova quantos pixels foram perdidos. Não houve reconstrução,
alongamento ou mistura com a célula vizinha.

| animation | direction | boundaryAlphaPixels | requiresVfxReview |
|---|---|---:|---|
| attack0 | north | 1 | false |
| attack0 | east | 5 | false |
| attack1 | south | 9 | true |
| attack1 | southwest | 11 | true |
| attack1 | west | 5 | false |
| attack1 | northwest | 11 | true |
| attack1 | north | 5 | false |
| attack1 | northeast | 5 | false |
| attack1 | east | 4 | false |
| attack1 | southeast | 9 | true |
| attack2 | south | 6 | false |
| attack2 | southwest | 5 | false |
| attack2 | west | 5 | false |
| attack2 | northwest | 6 | false |
| attack2 | north | 4 | false |
| attack2 | northeast | 6 | false |
| attack2 | east | 5 | false |
| attack2 | southeast | 6 | false |

Os quatro casos marcados de attack1 precisam de revisão da fonte artística.
Mesmo sem flag, os demais ataques listados merecem conferência dos brilhos.
