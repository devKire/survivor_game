# Comerciante físico

`refuge:trader` é um título funcional, sem nova biografia canônica. Posição (940,755), raio 80/colisão 14; aproximação (900,755). Usa silhueta NPC existente e painel dentro do Shell, com comprar/vender/histórico e confirmação. Não há mercado entre jogadores, recompra, GEMS ou equipamento LEGENDARY.

| Oferta v1 | Item | Custo |
| --- | --- | --- |
| stock:blade | Lâmina Gasta COMMON nível 1 | 12 GOLD |
| stock:mantle | Manto de Cinzas COMMON nível 1 | 10 GOLD |
| stock:barter-mantle | Manto de Cinzas COMMON nível 1 | 2 minérios + 6 fibras |

Duas compras por conta/dia; uma unidade por pedido. O escambo é mais caro que fabricar o mesmo manto e permite negociação em contas sem GOLD. Saldo não é atualizado definitivamente antes da resposta do servidor.

Venda: COMMON 1 GOLD, RARE 2, EPIC 3, LEGENDARY indisponível. Três vendas e no máximo cinco GOLD/dia UTC por conta. Somente instâncias próprias, unitárias, íntegras, desequipadas em INVENTORY. Item vendido é removido na mesma transação que credita a carteira, registra CurrencyTransaction, persiste a versão econômica e cria receipt/histórico. Retry retorna o mesmo resultado; outro pedido para o item removido falha.

O catálogo atual não contém equipamentos exclusivos de quest; materiais narrativos/raros não são comercializados. Definições desconhecidas são rejeitadas, portanto conteúdo futuro exige política de venda explícita. Não deduzir disponibilidade de nomes ou de flags enviadas pelo cliente. [Política de GOLD](RPG-ECONOMY-POLICY.md) e [transações](RPG-CRAFTING-PERSISTENCE.md).
