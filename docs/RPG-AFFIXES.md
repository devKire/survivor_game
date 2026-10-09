# Affixes RPG — conteúdo v1

Affixes são dados estáticos em `src/game/content/rpg/affixes.ts`; o item guarda somente `id`, `tier` e `value`. Equipamento não substitui `Weapon` nem seus projéteis, caminhos e evoluções.

| Raridade | Número de rolls | Tier máximo |
| --- | --- | --- |
| COMMON | 0 | 1 |
| RARE | 1 | 1 |
| EPIC | 2 | 2 |
| LEGENDARY | 3 | 3 |

Tier efetivo: `min(tier da raridade, 1 + floor((nível - 1) / 30))`. Os limites do tier 1 são multiplicados por `1 + 0,25 * (tier - 1)` e arredondados para dentro na grade do affix. Rolls têm até seis casas decimais.

| Affix | Stat/operação | Faixa tier 1 | Passo | Slots | Peso |
| --- | --- | --- | --- | --- | --- |
| force | damage / ADD_PERCENT | 0,01–0,03 | 0,001 | WEAPON | 4 |
| precision | critChance / FLAT | 0,005–0,015 | 0,001 | WEAPON, CHARM | 2 |
| haste | cooldown / ADD_PERCENT | −0,03–−0,01 | 0,001 | WEAPON | 2 |
| life | maxHealth / FLAT | 2–6 | 1 | ARMOR | 4 |
| guard | armor / FLAT | 0,1–0,3 | 0,1 | ARMOR | 2 |
| renewal | recovery / FLAT | 0,02–0,08 | 0,01 | ARMOR, CHARM | 2 |
| reach | area / ADD_PERCENT | 0,01–0,03 | 0,001 | CHARM | 3 |
| fortune | luck / ADD_PERCENT | 0,01–0,03 | 0,001 | CHARM | 3 |

`rollEquipmentAffixes` usa seed explícita, hash FNV-1a e PRNG inteiro local, incluindo versão, definição, raridade e nível no domínio da seed. Seleção ponderada sem reposição; saída ordenada por ID. Não usa `Math.random`. A validação rejeita IDs desconhecidos, operações arbitrárias, duplicatas, incompatibilidade de pool/slot, tier fora do limite, valor não finito/fora da grade e resultado que não corresponda à seed.

Itens legados: `contentVersion=1`, `rollSeed=null`, `affixes=[]`, preservando raridade e quantidade. Ausência de roll não fabrica affixes retroativos. Uma futura fonte autoritativa deve gerar seed criptográfica no servidor e persistir o resultado. Não existe endpoint público de roll, grant ou edição de affixes nesta fase. Novas versões deverão preservar os catálogos antigos ou definir migração explícita; versão desconhecida falha de forma fechada.
