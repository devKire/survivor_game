# Presença real

Uma presença por conta, independente de Team/GameSession. A conexão autentica com o ticket curto existente e WORLD_ENTER exige protocolo 1 e flags. O personagem ativo e a build vêm do banco; IDs públicos aleatórios, nome, personagem, nível, HP e movimento integram o AOI. Inventário, economia, email, sessão e seed privada não integram snapshots públicos.

Última conexão autenticada vence; fechar a anterior invalida sua capacidade e remove o avatar. A reconexão cria epoch/ID público novos e recupera checkpoint seguro, sem duas entidades. Uma zona suporta inicialmente até 20 presenças, versus grupo social de cinco. A zona não termina quando alguém sai. Zonas vazias são descartadas após 30 segundos, sem apagar progresso durável. Inatividade de gameplay por 15 minutos encerra presença; PING não é atividade remunerada.

O banco possui exclusividade de visita ativa por conta. O realtime adquire advisory lock dedicado antes da recuperação: outra autoridade contra o mesmo banco falha na entrada. O lock é mantido até shutdown; perda da conexão encerra a autoridade. Não há coordenação multi-shard nem promessa de MMO massivo.
