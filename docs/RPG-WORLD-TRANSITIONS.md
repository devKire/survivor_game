# Zonas e transferência

As zonas abertas possuem uma instância compartilhada por autoridade: obelisk-refuge v2 (estações Fase 7) e ruins-outskirts v1. O portal refuge:exploration-portal leva aos Arredores; world:ruins:refuge-return permite retorno próximo do spawn seguro (0,0). Não há READY/START, líder, cronômetro de 900 segundos ou redirecionamento /team.

O coordenador valida conexão/epoch, distância, portal canônico, HP e capacidade; reserva vaga, congela movimento/coleta, persiste checkpoint e transfere o mesmo avatar para o spawn seguro do destino. O cliente recebe full snapshot com epoch novo e mantém socket/Canvas. Retrys do mesmo pedido não transferem duas vezes; ID reutilizado para outro portal é rejeitado.

Se a confirmação do commit falhar, a presença é encerrada para evitar autoridade espacial divergente do checkpoint durável. Reentrada lê o checkpoint efetivamente confirmado; não presume commit nem recria movimento perdido. Reinício preserva checkpoint, quests, itens, materiais e receipts, com novas presenças autenticadas.
