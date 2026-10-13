# Segurança e operação da exploração

- Autenticação reutilizada: Better Auth, ticket curto, nonce único, origem WebSocket e revalidação de sessão existentes. Nenhuma autenticação paralela ou segredo novo.
- CONFIG aceita RPG_EXPLORATION explicitamente, distinto de normal/SURVIVOR/PvP. START fixa Ruínas/900s/seed canônica, exige líder, prontos, 1–5 membros, ausência de Arena e outras atividades RPG. Builds são carregadas no servidor sob lock, validadas e congeladas.
- Factory associa a instância ao GameSession em WeakMap privado. Sessão experimental ou Coop criada livremente não recebe autoridade. Serviços não são endpoints públicos de grant.
- Inputs são estritos; GATHER_START não aceita userId, posição, quantidade, material, seed ou tempo concluído. GATHER_CANCEL, EXPLORATION_REFRESH e EXPLORATION_LEAVE também são fechados. Compartilham limite de 80 operações/minuto, fila máxima 8 e 70 mensagens/segundo existentes. INPUT usa normalização e colisão existentes.
- Writer também compara descritores com geração canônica, além da checagem de proximidade na simulação. Flags são checadas na entrada, início de coleta e transação. Recursos, descobertas e quantidades não vêm de localStorage, CloudSolo, imports ou RunSnapshot.
- Persistência: Team → sessão → UserProgress, Serializable com até três tentativas apenas para abortos seguros. Unicidade de origem e requestId, FKs de ownership, hashes e triggers imutáveis. Sem alteração de GOLD/GEMS ou UserProgress.version.
- Queda antes de commit: rollback. Depois de commit: material/claim recuperáveis, sem nova concessão. Reinício: RUNNING → INTERRUPTED, posições/coletas pendentes descartadas; não inventa evidência. Saída é controle de sessão, não settlement.
- Erros internos são genéricos; revisão vencida orienta atualizar. Diário é autenticado, filtrado por conta, sem exposição de seed ou payload interno. Callback allowlist inclui apenas rotas RPG internas.

## Rollout

RPG_ENABLED=true e RPG_EXPLORATION_ENABLED=true nos processos web **e** realtime. Defaults falsos; RPG_REFUGE_ENABLED continua controlando apenas o Refúgio, RPG_EXPEDITIONS_ENABLED apenas combate/recompensas de expedição. Não habilitado em produção nesta entrega.

Integrar todos os PRs → aplicar migração → validar staging/HTTPS/WSS → testar contas controladas, repetição e reconexão → observar latência/erros/claims/saldos → rollout restrito. Uma autoridade realtime por banco; múltiplas réplicas sem roteamento/coordenador continuam não suportadas. PostgreSQL é atômico diante de workers concorrentes, mas isso não torna o lifecycle multiplayer multi-réplica.

Não executar testes contra contas reais ou ambiente com jogadores ativos: o startup do realtime interrompe sessões perdidas. Não excluir históricos de GameSession/claims para liberar espaço sem política de retenção que preserve direitos consumidos. Cadastros novos continuam direitos independentes; esta versão não implementa detecção de bots ou limites por identidade humana.
