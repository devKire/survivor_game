# Persistência da exploração

`20261012100000_rpg_exploration` adiciona quatro tabelas no schema limiar. Nenhuma migração histórica é editada; nenhuma linha de itens/depósito/materiais/receipts antigos é reescrita. As constraints de tipo de Team/GameSession passam a aceitar RPG_EXPLORATION; seus defaults continuam SURVIVOR.

RpgExplorationSession referencia o par GameSession(id,expeditionKind), fixa região/versões e acompanha RUNNING → COMPLETED ou INTERRUPTED. RpgExplorationParticipant referencia membro e personagem pelo mesmo usuário, conserva build/hash imutáveis e activeUserId único. RpgDiscoveredPoi tem chave conta/região/versão/POI. RpgResourceClaim tem chave de concessão conta/região/versão/nó/ciclo e outra conta/requestId, com material, quantidade efetiva, revisão e origem. Triggers impedem reescrever claims, descobertas e identidades; FKs acompanham exclusão da conta. Não excluir sessões históricas para housekeeping: seus claims são parte da prova de consumo.

Gathering e descoberta usam Serializable, retries apenas para abortos seguros e ordem Team → sessão → UserProgress. Equipamento/depósito/economia já usam esse último lock. Revisão RPG incrementa uma vez por descoberta nova ou saldo alterado; não incrementa por replay, saturação sem saldo ou saída. UserProgress.version não é escrito. A revisão enviada na intenção de coleta deve corresponder à atual; caso contrário, atualizar estado e repetir com novo requestId.

O requestId vincula payload e sessão por hash. Replay confirmado retorna receipt sem exigir nova duração, mesmo após encerramento. Novo requestId para nó/ciclo já concedido retorna concessão original. Materiais saturam em 1e9, e quantidade efetiva (inclusive zero) é registrada. Falha antes do commit reverte material, revisão e claim. Falha depois é recuperável pelo receipt/diário.

Provas de posição/tempo são efêmeras na simulação associada pelo factory interno; o writer não está disponível por Server Action nem rota HTTP. Reinício interrompe sessões RUNNING, conserva claims confirmados e não reconstrói coletas em andamento. Fechamento funciona com flags desabilitadas e não concede recompensas.
