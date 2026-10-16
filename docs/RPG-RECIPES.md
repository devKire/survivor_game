# Receitas v1

Catálogo imutável `game/content/rpg/crafting/recipes.ts`. Uma unidade por operação; receita e catálogo v1 exigidos na intenção. Custos/raridade/nível/resultados são resolvidos no servidor. O cliente nunca escolhe quantidades, preço, seed ou affixes.

| Receita / ID de item | Minério | Fibra | Pó | Fragmento | Nível | Raridade |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Lâmina Gasta / blade-weathered | 6 | 0 | 2 | 0 | 1 | COMMON |
| Manto de Cinzas / mantle-ash | 2 | 4 | 0 | 0 | 1 | COMMON |
| Talismã do Obelisco / charm-obelisk | 0 | 4 | 3 | 0 | 1 | RARE |
| Lâmina do Eco / blade-echo | 8 | 0 | 4 | 1 | 5 | RARE |
| Manto da Quietude / mantle-still | 0 | 8 | 2 | 1 | 5 | RARE |
| Lente do Limiar / charm-lens | 0 | 3 | 6 | 2 | 5 | RARE |

IDs de receita: `recipe:` seguido pelo ID do item. As três avançadas exigem a story flag `material-samples-delivered`, concedida por Os Ecos da Matéria recompensada. Nara/Ivo podem fabricar Lâmina do Eco; Orin/Sena, Manto da Quietude. Demais definições preservam acesso comum. Receitas iniciais não dependem da escolha narrativa REMNANTS/ECHOES e não bloqueiam personagens básicos.

Máximo seis fabricações por conta/dia UTC, duas raras, uma instância por pedido. Inventário/depósito compartilham o limite de criação da estação em duzentas instâncias existentes; receitas não removem dados históricos ou restringem fontes antigas de loot. Saída INVENTORY desequipada, nível mínimo canônico e affixes válidos pelo roller existente. Não há equipamento novo nem alteração dos modificadores-base.

Os valores são conteúdo proposto da Fase 7. Mudanças futuras exigem versão nova, preservando validação/replay das versões publicadas. Consulte [hipóteses e limites](RPG-ECONOMY-BALANCE.md).
