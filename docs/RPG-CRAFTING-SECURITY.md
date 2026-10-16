# Segurança da Forja dos Ecos

WORLD_RPC utiliza a conta da sessão/ticket autenticado. Crafting não possui rota de grant, payload de saldo, input de owner, Action legada alternativa, seed escolhida pelo cliente ou opção de GEMS. Schemas estritos aceitam somente intenção, versão, revisão e requestId. O ID externo do RPC deve coincidir com o pedido da mutação.

Cada serviço exige a estação física apropriada no Refúgio, jogador vivo e epoch atual. O coordenador mantém a conexão/presença, congela input durante o RPC e revalida distância em callbacks depois de awaits e locks. Um permit privado não pode ser criado pelo cliente. Além de assertWorldMutationAllowed, a forja exige visita ativa correspondente no banco e checkpoint Refúgio. Sem permit ou em Ruínas, falha mesmo chamando o serviço interno diretamente. UI não autoriza distâncias.

Receitas condicionais usam somente story flags canônicas, vinculadas a progresso REWARDED e receipt durável da mesma conta. A definição/versionamento da quest precisa declarar aquela flag. Uma flag isolada, fonte incorreta ou apenas texto de sucesso não desbloqueia conteúdo. Não foram adicionados objetivos de quest de crafting/comércio nem reinterpretação de receipts antigos.

Transações usam UserProgress FOR UPDATE, Serializable e revisão RPG. Receipt precede a checagem de revisão em replay; hash/operação precisam coincidir. Custos e grants econômicos, saldos materiais, instância, revisão e histórico confirmam juntos. Criação, upgrade e reforge reutilizam a validação/roller; conteúdos corruptos falham fechados. Materiais/GOLD negativos ou overflow abortam, sem clamp que consuma custo para perder resultado.

Itens equipados, STASH, pilhas ou de outra conta não podem ser vendidos/aprimorados/reforjados. Um item vendido deixa de existir; histórico conserva seu snapshot. Promover/rolar conserva ID e ownership. Cap de criação não remove inventários antigos. Cotas e volumes são por conta/dia UTC, sob o mesmo lock: mudar personagem, visita, aba ou requestId não renova direito.

GOLD usa exclusivamente grantCurrency/spendCurrency e persistSave, com CurrencyTransaction no mesmo tx. Nesses casos UserProgress.version incrementa; operações só RPG preservam a versão. GEMS, Survivor, RunState/RunSnapshot e loadouts PvP ficam fora das mudanças. Testes exercitam concorrência com uma escrita econômica Survivor, disputa com entrega de quest, forja versus depósito, replay e rollback em três pontos.

Métricas agregadas distinguem início/confirmação/replay, revisão vencida, intenção inválida, rejeição espacial, retry confirmado de serialização e falha transacional. Logs opt-in REALTIME_DIAGNOSTICS omitem conta, tokens, seeds e conteúdo da sessão. Health recebe apenas contadores/latências, nunca saldo ou inventário. A duração da operação inclui espera por lock; não é medição separada de lock wait.

Banco de testes é local e descartável. SIGKILL, triggers de falha e migrações de upgrade não foram executados contra produção. O rollout permanece desligado por padrão; rollback conserva o binário/protocolo compatível e desabilita RPG_CRAFTING_ENABLED, preservando itens/receipts. Veja [deploy](RPG-PHASE7-DEPLOYMENT.md) e [QA](RPG-PHASE7-QA.md).
