# Expedição RPG pública

Com ambas as flags habilitadas, o líder escolhe RPG no lobby existente.
CONFIG fixa Ruínas/normal/600 segundos, sem transformar RPG em dificuldade.
READY e START usam os mesmos participantes autenticados (1–5). START valida
desbloqueios, ArenaSeat, cooldown de 60 segundos e exclusividade por usuário;
cria GameSession, autorização RPG e builds sob a mesma transação Serializable.
O lock Team é compartilhado com a formação de partidas Arena.

A factory realtime lê a autorização persistida e associa a instância Coop por
WeakMap privado. Somente essa instância pode apresentar o terminal ao writer.
O harness da Fase 2 não recebe essa associação. Reconnect conserva a mesma
build; alterações no hub valem apenas para a próxima sessão.

O motor acumula até 24 eventos, sem IO por kill. Boss e elite entram no ledger
no ponto em que damageEnemy confirma a morte uma única vez. Baú entra após
interação próxima, válida, com consumo de chave e uso pessoal confirmado.
Não conta pickup de baú de boss novamente. Inimigos comuns não geram ledger.
Presença e movimento efetivo são medidos em ticks; mera conexão não garante XP.
As regras completas estão em RPG-LOOT.md. O goal antecipado não encerra RPG
antes dos 600 segundos; os modos Survivor conservam o comportamento anterior.

Fim real → terminal persistido → transação de recompensa → RESULT confirmado.
Se o terminal foi salvo mas a entrega falha, RESULT informa PENDING; o histórico
mostra o estado persistido e o worker tenta novamente a cada dez segundos.
Se nem o terminal pôde ser salvo, a sala permanece em memória e tenta novamente.
Reinício perde sessões RUNNING sem recompensa; preserva TERMINAL para replay.

Protocolo: campos opcionais expeditionKind em CONFIG/ACCOUNT/STARTED e
sessionId/rewardStatus em RESULT. Snapshot e seu delta não mudam. Nenhuma seed
privada, build persistida ou lista de recompensas é transmitida pelo snapshot.
O client envia intenções de gameplay e não pode declarar kills, XP ou vitória.

O teste rpg-expedition-realtime inicia sessões por WebSocket autenticado e
percorre 600 segundos do motor para equipes de 1/2/5. Um driver IPC exclusivo
de testes acelera ticks, oferece invulnerabilidade e aplica damageEnemy aos
inimigos realmente produzidos pelo director. Não cria terminal nem chama grant.
O teste verifica receipts no PostgreSQL, replay e preservação de UserProgress.
