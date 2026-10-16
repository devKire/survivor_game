# Segurança do mundo compartilhado

## Fronteiras de confiança

O socket usa ticket autenticado, sessão válida, Origin permitido e os limites existentes de conexão/mensagem. `WORLD_*` tem schema estrito e versão própria; não substitui snapshots Survivor/PvP. A conta vem da sessão, nunca de um `userId` informado no comando. Snapshots divulgam somente projeções públicas limitadas por AOI; não incluem seeds privadas, visitas, autoridade, loadouts completos ou e-mail.

Movimento exige epoch atual e sequence crescente, aceita somente eixos normalizados e usa colisão/velocidade do servidor. Input expira em 250 ms. Proximidade, zona, personagem, equipamento e disponibilidade são checados pelo coordenador. Transferência reserva capacidade e confirma checkpoint antes de trocar a presença. Uma conta possui uma presença, substituída pela conexão autenticada mais recente. Há timeout de inatividade de quinze minutos e descarte de zona vazia após trinta segundos.

Comandos discretos têm fila limitada e limite de frequência; input possui caminho separado. Serviços que alteram conta recebem um permit privado do coordenador, revalidado sob lock e após awaits. Server Actions antigas não podem modificar a build por fora durante uma visita ativa. Não existe endpoint de grant, teleport, conclusão de morte ou seed escolhida pelo cliente.

## Persistência e recompensas

Mutações usam lock UserProgress, Serializable, revisão RPG e receipts existentes. Somente abortos transitórios conhecidos têm retries limitados. Operações RPG não incrementam UserProgress.version nem alteram GOLD/GEMS. FKs compostas, checks e índices conservam ownership; claims têm exatamente uma origem entre sessão e visita de mundo. Limites de gathering são compartilhados entre os modos antigo e novo.

O evento PvE nasce de dano/morte observados na simulação, com participantes elegíveis, identificador de ocorrência e seed privada crypto. Persistir a prova precede qualquer grant; evento e receipt são imutáveis. Settlement trava evento e contas em ordem estável e grava XP, nível, atributos, material, item e receipt no mesmo commit. Retry retorna o receipt já confirmado. Evento PENDING sobrevive a crash; resultado ainda em memória é perdido sem recompensa inventada. A fila é limitada e suspende novos spawns quando se aproxima do limite.

Convites são privados, vinculados ao destinatário, expiram e respeitam grupo de cinco. Chat local é efêmero por zona; grupo/DM usam autorização existente e DM exige amizade. Identificadores públicos não dão acesso ao banco de outra conta. Texto é validado e o cliente conserva apenas cinquenta mensagens. Erros inesperados retornam mensagem genérica, sem stack/SQL/credenciais.

## Autoridade e operação

Uma conexão PostgreSQL direta detém advisory lock de sessão durante toda a vida do realtime, antes das recuperações. Perder a conexão encerra a autoridade. Para Neon, o endpoint `-pooler` é convertido ao correspondente endpoint direto somente nessa conexão; TLS é verificado. Outros proxies em transaction pooling não são suportados para esse lock. Processos web podem usar pooling normalmente.

Flags são server-side, exigidas também no realtime. `RPG_SHARED_WORLD_ENABLED=false` bloqueia entrada/comandos públicos do mundo. Não se deve usar feature flag como substituto de autenticação. Observabilidade opt-in expõe apenas contagens e tempos, nunca provas ou secrets. Testes de banco/realtime devem usar bases descartáveis: instalam gatilhos de falha e encerram processos propositalmente.
