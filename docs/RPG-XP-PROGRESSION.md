# XP permanente e orçamento

`rpgLevelFromXp`, `attributesAtLevel` e o orçamento existente são reutilizados.
XP total para alcançar nível L é `100 * (L - 1)^2`. Nível máximo 100, XP máximo
1.000.000.000. Concessões aceitam inteiros entre 0 e 200 por expedição v1.

A política satura explicitamente no limite de XP e registra `xpGranted` efetivo.
O saldo é sempre `5 * (level - 1) - soma(attributes)`, mantendo distribuições.
Não se soma cinco pontos manualmente e não se converte nível/XP temporário.
O receipt impede aplicar a operação duas vezes. Concessão zero não reconcilia
nem aumenta níveis antigos. Para personagens legados com nível provisionado
independentemente do XP, preserva-se `max(nível atual, nível calculado)`; não há
regressão nem invalidação de pontos existentes.

Somente conclusão dá 100 XP. Com todos os bônus elegíveis, são 181 XP. Assim,
níveis 2/5/10/20 requerem respectivamente cerca de 1/9–16/45–81/200–361
vitórias de 10 minutos. Limites de eventos impedem XP ilimitado por densidade
de inimigos. Essas estimativas não incluem derrotas nem tempo de lobby.
