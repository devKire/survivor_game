# Estatísticas de combate RPG — regras v1

`CombatStats` agrega `Stats` existentes e `maxHealth`, `speed`, `armor`. `sourceId` identifica atributo (`rpg-attribute:*`), instância (`rpg-item:*`) ou affix (`rpg-affix:*:*`). `growth` e `amount` não são modificáveis por equipamento nesta versão: zero projéteis ou XP adicionais permanentes.

Fórmula por stat: `(base + soma FLAT) * (1 + soma ADD_PERCENT) * produto MULTIPLY`, seguida dos limites abaixo. Modificadores são ordenados por stat/operação/origem/valor antes de agregar, inclusive percentuais, garantindo resultado independente da ordem de entrada. Percentuais são frações. `cooldown=-0,03 ADD_PERCENT` reduz o intervalo em 3%; não significa “+3% de cooldown”. O catálogo não contém multiplicadores complexos.

| Stat | Máximo de contribuição RPG |
| --- | --- |
| maxHealth | +50% da base, limitado a +100 HP; inteiro arredondado |
| damage | +35% da base |
| speed | +20% da base, limitado a +40 |
| armor | +3 |
| cooldown | redução máxima de 20%; piso 0,3; não aumenta o intervalo |
| area / duration | +25% da base |
| pickupRange | +25% da base, limitado a +30 |
| luck | +20% da base |
| critChance | +0,10 absoluto, teto 0,50 sem reduzir uma base preexistente maior |
| recovery | +1 HP/s |

Os caps limitam a contribuição RPG sobre as estatísticas já calculadas pelo engine; não removem bônus Survivor. Sem modificadores, todas as estatísticas permanecem exatamente iguais. O resolver retorna nova estrutura, rejeita NaN/infinito, limita inputs e evita valores negativos/vida zero. Compilação/validação ocorre no início da build; aplicação compilada ocorre somente quando `Player.recalculate()` já seria chamado.

| Atributo permanente | Efeito por ponto |
| --- | --- |
| vitality | +1 maxHealth |
| power | +0,2% damage |
| agility | +0,1% speed e −0,05% cooldown |
| focus | +0,05 ponto percentual de crítico e +0,1% duration |
| will | +0,005 HP/s recovery e +0,01 armor |

Não há alteração de raio de colisão, bônus dos personagens ou armas iniciais. A ficha usa `previewRpgBuild`: base, base com atributos e resultado com equipamento, todos pelo mesmo resolver. Os números são uma estimativa da futura sessão RPG; o nível da run continua temporário e independente.

## Medição inicial de balanceamento

O teste determinístico com projétil Ember e colisão real mediu dano relativo
1,00 no Survivor, 1,01 com cinco pontos em poder e 1,05 acrescentando Lâmina
Gasta. Repetir o recálculo não acumula esse ganho. Quatro personagens preservam
armas iniciais, passivas, evoluções e raio de colisão.

O benchmark `scripts/rpg-benchmark.ts` usa Orin, nível RPG 100, 99 pontos em cada
atributo e três lendários tier 3. A seed `benchmark-v1` produziu dano 1,278,
cooldown 0,9195 e crítico 0,1405. Com crítico 1,8× do motor, a estimativa de DPS
direto é 1,464× a base; área e duração dependem de arma e posicionamento, não
estão incluídas nessa estimativa. Nenhum projétil permanente é acrescentado.

Esses caps são conservadores para a primeira integração e não representam uma
validação de balanceamento de todas as armas ou da futura economia de loot.
Antes de expedições públicas, medir também combinações de evoluções, densidade
de alvos e duração longa. Não compensar isso alterando o Survivor clássico.
