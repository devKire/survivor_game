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
