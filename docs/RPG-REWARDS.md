# Recompensas persistentes — versão 1

O servidor cria `RpgExpeditionSession` junto com `GameSession` e congela as builds
dos participantes na mesma transação Serializable de START. Ordem de locks:
Team, sessão RPG quando existente, UserProgress em ordem de userId. A revisão
RPG e os desbloqueios são lidos sob esse lock. Nenhum save do cliente participa.

`rewardSeed` usa 32 bytes criptográficos privados e não é worldSeed. As seeds
derivadas, equipamentos e affixes são determinísticos conforme RPG-LOOT.md.
Hashes canônicos ignoram a ordem das chaves JSONB, preservando arrays.

Ao terminar, a simulação autoritativa persiste primeiro um terminal imutável.
A entrega lê somente esse terminal e a configuração persistida, em outra
transação Serializable. Todos os participantes, XP, materiais, itens e receipts
confirmam juntos. A chave `(sessionId, userId)` e o lock de sessão impedem
duplicação. Um erro em qualquer participante desfaz também os anteriores.
Somente abortos transitórios seguros recebem até três tentativas.

Recibos registram elegibilidade, fontes/eventos, versão, XP efetivo, níveis,
pontos concedidos, materiais efetivos e itens/affixes. Não contêm seeds.
XP e materiais saturam nos limites existentes (1 bilhão); o recibo explicita
o valor efetivo e materiais limitados. Itens são instâncias de quantidade 1,
inicialmente desequipadas. Não há grant público nem conversão para GOLD/GEMS.
UserProgress.data/version não mudam. A revisão RPG aumenta uma vez por usuário
que recebe uma mudança efetiva; derrota e inelegibilidade produzem recibo zero.

Estados: RUNNING → TERMINAL → SETTLED; RUNNING → INTERRUPTED. Reinício sem
terminal interrompe a sessão sem recompensa. Um terminal pendente nunca é
reconstituído de snapshots ou descartado ao desligar flags. Desligar RPG_ENABLED
ou RPG_EXPEDITIONS_ENABLED impede entradas/entregas; a gravação de evidência
terminal continua. O worker tenta novamente quando ambas estão habilitadas.

A migração 20261009200000 adiciona tabelas, índices, constraints e triggers,
preservando sessões existentes como SURVIVOR. A FK GameSessionMember.user passa
a Cascade para permitir exclusão de conta com histórico RPG. Os novos receipts
e participantes acompanham a exclusão; não se altera a política de Arena.
Triggers impedem alterar seed, build inicial, identidade e recibo, mas permitem
DELETE em cascata. Exclusão de conta durante uma expedição exige atenção:
se faltar um participante ao persistir/liquidar, a validação falha fechada;
um terminal inconsistente fica pendente para investigação, sem entrega parcial.

O processo realtime continua sendo autoridade única por banco. Iniciar duas
instâncias ativas sem coordenação não é suportado pelo lifecycle atual.
