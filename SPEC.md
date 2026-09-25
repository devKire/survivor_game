# LIMIAR — evolução incremental

## §G

Preservar survivor local; evoluir engine compartilhado, contas/social e co-op autoritativo até 5.

## §C

Auditoria integral antes de código (docs/AUDIT.md). Canvas preservado. TS strict sem any.
Reutilizar conteúdo/comportamentos. Banco nunca recebe frames. Sem polling de gameplay.
Sem migrate reset, segredos, autenticação em localStorage ou recompensas confiadas ao cliente.
Usuário autorizou implementação/testes/correções das 17 fases; checkpoints não exigem nova aprovação.

## §I

- I.core: simulação headless compartilhada; input normalizado; tick fixo.
- I.save: chave limiar.save.v1; schemas antigos migráveis; export/import e resume.
- I.web: Next App Router, ações discretas autenticadas, UI em português.
- I.db: Prisma/PostgreSQL, migrations incrementais; DATABASE_URL obrigatória para online.
- I.ws: WS autenticado por ticket curto; schemas fechados; inputs e snapshots delta.

## §V

V1. Catálogo e saves antigos preservados; baseline byte a byte disponível.
V2. Core importável em Node sem window/document/canvas; solo sem rede.
V3. Sessão HttpOnly/SameSite/Secure produção; hash moderno; userId da sessão.
V4. Máximo 5 atômico, sem ingresso após start; ready de todos; liderança transferível.
V5. Estado online pertence ao servidor; input não contém posição/dano/reward confiáveis.
V6. Resultados/recompensas idempotentes; banco sem snapshots de frames.
V7. Room compartilha mundo/seed/waves; builds individuais; XP cooperativa normalizada.
V8. Prediction/reconciliation local, interpolation remota, interesse/deltas e reconexão.
V9. Amizades autorizam DMs; chat texto limitado, paginado, protegido contra spam.
V10. Progressão: 25–30 decisões alvo; intervalo entre escolhas; path 6–8 min; evolução 10–14.
V11. HUD essencial, pause/build completo; banir em modo seleção; late-game menos modais.
V12. Reconnect não duplica jogador/recompensa; partySizeAtStart imutável; revive/wipe.
V13. Formatos locais não constituem mérito online; import explícito com proveniência.
V14. Verificações reais; registrar bloqueios e métricas medidas, nunca resultados supostos.
V15. Escolhas/recompensas pendentes sobrevivem ao resume; status restaurados sem protótipos perdidos.

V16. Snapshot aplicado uma vez por tick/sala; RTT/React não reaplicam delta. Resync preserva cena e inputs não confirmados.
V17. Sessão online mantém 1 engine/RAF/Input/Canvas; resize sem mudança não limpa framebuffer. Diagnóstico opt-in e memória limitada.
V18. FX transitórios compactos e deduplicados; 8 armas base/evoluídas legíveis para owner/observer; dano sempre servidor.
V19. Perfis 10/15/30 compartilhados: progressão, bosses, paths, evolução, conclusão e recompensa; líder escolhe antes do start, sessão persiste autoridade.
V20. Meta efeito/descrição/current/next/max compartilham definição/unidades; conquistas registradas nunca pagam retroativamente.
V21. HUD online isolada do menu; drawer não pausa; chat recolhido; starter muda sem alterar bônus do personagem.

V22. Carteira online em UserProgress; toda mutação financeira com lock, ledger e transação única.
V23. Recompensa por referência e compra por rank esperado pagam/debitam uma única vez; saldo inteiro 0..1e9.
V24. XP não é moeda; drops comuns concedem Gemas; Ouro só fontes raras; meta custa Gemas.
V25. economyVersion migra ouro legado 1:1 para Gemas uma vez; níveis/save/archive preservados; cliente não concede mérito online.
V26. Fighter morto/desconectado não cria novos ataques nem consome cooldown ofensivo; projéteis/áreas/efeitos existentes continuam atualizando e expiram normalmente; respawn não produz burst.


## §T

Orientação 23/09: priorizar implementação; evitar bateria ampla de testes; verificações essenciais por fase.
Novo path econômico/competitivo autorizado em 23/09/2026, incremental; ver docs/ECONOMY-AUDIT.md.

| id | status | tarefa | cites |
|---|---|---|---|
| T24 | x | F1 Gemas/Ouro, migração auditada, ledger, UI, concorrência e regressões | V1,V6,V13,V14,V22,V23,V24,V25 |
| T25 | x | F2 Obelisco: cinco ramos, prerequisitos, preview e compra autoritativa | V20,V22,V23 |
| T26 | x | F3 coleção cosmética e loja sem poder competitivo | V5,V22,V23 |
| T27 | x | F4 Gacha cosmético, pity, fragmentos e crafting (estatística adiada pelo usuário) | V6,V22,V23 |
| T28 | x | F5 Arena casual autoritativa normalizada, rounds e reconexão | V2,V5,V8,V14 |
| T29 | x | F6 Ranked 1v1, MMR, temporadas e recompensas | V5,V6,V14,V22 |
| T30 | x | F7 5v5: bases, três rotas, minions e instrumentação de carga | V2,V5,V8,V14 |
| T31 | x | F8 Soldado/Construtor/Comandante e Energia temporária | V5,V14 |
| T32 | x | F9 Ranked 5v5, temporadas e validação final | V5,V6,V14,V22 |

| id | status | tarefa | cites |
|---|---|---|---|
| T1 | x | Baseline: auditoria, cópia, navegador, hashes | V1,V14 |
| T2 | x | Next/TS e extração preservando gameplay | V1,V2,V15,I.core,I.save |
| T3 | x | Prisma/schema/migrations e configuração | V3,V6,I.db |
| T4 | x | Auth: cadastro/login/logout/sessão | V3,I.web |
| T5 | x | Progresso online e import explícito | V6,V13,I.save |
| T6 | x | Design pass e telemetria | V10,V11 |
| T7 | x | Amizades/presença/DM | V3,V9 |
| T8 | x | Equipe/código/ready/liderança | V4 |
| T9 | x | WS/tickets/schemas/rooms | V3,V5,I.ws |
| T10 | x | Movimento/prediction/reconciliation/interpolation | V8 |
| T11 | x | Simulação autoritativa compartilhada | V2,V5,V7 |
| T12 | x | Co-op XP/loot/estruturas/revive/scaling | V7,V12 |
| T13 | x | Party HUD/chat/build pendente | V9,V11 |
| T14 | x | Segurança e casos adversariais | V3,V4,V5,V6,V9,V13 |
| T15 | x | Carga 5 clients, latência/reconnect | V8,V12,V14 |
| T16 | x | Balanceamento com telemetria | V10,V14 |
| T17 | ~ | QA final e relatório | V1,V14 |

| T18 | ~ | P0: baseline Chrome, instrumentação, causa, correção, estabilidade | V8,V14,V16,V17 |
| T19 | . | Paridade FX das oito armas e evoluções | V5,V18 |
| T20 | . | Perfis 10/15/30, persistência e recompensa | V5,V6,V19 |
| T21 | . | Starter weapons, metas e recompensas de conquistas | V6,V20,V21 |
| T22 | . | UX lobby/HUD/drawer/chat | V11,V17,V21 |
| T23 | . | QA 2/5 players, carga, 10 min contínuos, solo e build | V14,V16,V17,V18,V19,V20,V21 |

## §B

| id | date | cause | fix |
|---|---|---|---|
| B1 | 2026-09-15 | Snapshot original omite decisões pendentes/status com protótipo | V15 |

| B2 | 2026-09-15 | Extração textual alcançou strings/Canvas.save; corrigido e testado em browser | V1,V2 |
| B3 | 2026-09-15 | Fixture JSON importada sem atributo no runner ESM | Leitura explícita no teste; sem novo invariant |

| B4 | 2026-09-15 | Teste friendly-fire posicionou tank em alcance de contato | Separar dano hostil no cenário; V5/V7 |

| B5 | 2026-09-15 | Integração remota excedeu 20 s durante transações Neon | Timeout explícito de integração 120 s; V14 |

| B6 | 2026-09-15 | Contexto coop compartilhava banimentos/contadores pessoais; voto remoto exigia proximidade | Estado pessoal isolado e iniciador próximo; V7/V9 |
| B7 | 2026-09-15 | Simulação longa revelou recursão de explosões na sinergia Ember/Orbit e salto de níveis com XP acumulado | Marcar dano secundário, impedir múltipla morte, espaçar conversões automáticas; V6/V7/V10 |
| B8 | 2026-09-15 | Validador tratava dano fracionário de armas como contador inteiro | Aceitar magnitude finita; preservar progresso se snapshot inválido; V1/V15 |

| B9 | 2026-09-15 | Cinco READY concorrentes excedem retries Serializable com leitura anterior ao lock | Transações de lobby ReadCommitted com lock de linha explícito; V4 |

| B10 | 2026-09-15 | Instrumentação browser tentou interpretar HMR binário como JSON do jogo | Filtrar socket realtime no teste; V14 |

| B11 | 2026-09-15 | READY rápido podia chegar durante SYNC e ser descartado; leituras sobrepostas podiam exibir estado antigo | Fila de comandos limitada e geração das leituras; V4/V8 |
| B12 | 2026-09-15 | Dano de sinergia letal dentro de outro hit podia liquidar inimigo duas vezes | Guarda após dano secundário; V6/V7 |

| B13 | 2026-09-15 | Teste de spam sequencial levou mais que a janela de 10 s no Neon | Burst concorrente mede o limite dentro da janela; V9/V14 |
| B14 | 2026-09-15 | Menor peso de POIs mudaria o layout ao retomar uma seed antiga | Versionar gerador e preservar pesos legados em runs existentes; V1/V15 |

| B15 | 2026-09-15 | Next build não podia iniciar subprocesso TypeScript no sandbox (EPERM) | Reexecutado com permissão; sem alteração funcional, V14 |

| B16 | 2026-09-16 | Reutilização de objeto Pool podia reutilizar identidade de projétil no snapshot | ID por disparo e remoção explícita; V8 |

| B17 | 2026-09-17 | PONG/settings reaplicam delta, tick igual pede RESYNC; full apaga inputs sem ACK | V16 |
| B18 | 2026-09-17 | Snapshot no React pode coalescer deltas e renderiza menus; objetos visuais recriados em todo frame | V17 |
| B19 | 2026-09-17 | Cliente novo reinicia sequence abaixo do ACK após reconnect | V8,V16 |
| B20 | 2026-09-17 | Esc fecha chat, desfoca input e propaga para pausa da engine | V21 |
| B21 | 2026-09-23 | Script de auditoria importa env protegido por server-only | Executar node --conditions=react-server --import tsx; V14 existente basta |

| B22 | 2026-09-23 | Objeto de migração inferido sem chave pending | Record<string, unknown>; V25 basta |
| B23 | 2026-09-23 | Import validava envelope mas usava activeRun bruto; resume ignorava duração | Migrar snapshot junto e restaurar perfil; V19,V25 |
| B24 | 2026-09-23 | DNS Neon e subprocesso Next bloqueados no sandbox | Reexecutar verificações com permissão; V14, sem nova invariant |

| B25 | 2026-09-23 | Novo comando de fila exige classe no cliente; relatório lia snapshot ref durante render e cutoff usava Date.now em componente | Classe explícita, roster em estado e cutoff no servidor; V8,V14,V17 bastam; typecheck/lint, sem nova bateria conforme usuário |
| B26 | 2026-09-23 | Forfeit 5v5 mantinha deadline infinito e reconexão herdada aceitava abandonante | Override rejeita IDs no conjunto left; V5,V8 bastam |

| B27 | 2026-09-23 | Projétil consumido por minion poderia sobreviver até filtro do tick seguinte | Remover após colisão da Guerra e ignorar life<=0 no combate compartilhado; V5,V6 bastam |

| B28 | 2026-09-24 | Teste de auto-ataque presumiu dano fixo apesar de críticos aleatórios | Separar assertivas de disparo/cooldown do tuning e neutralizar crítico quando o fixture exige dano exato; sem novo invariant de produto |
| B29 | 2026-09-24 | `PvpSimulation.step` ignorava input do morto, mas `CompetitiveCombat.advance` ainda chamava `Weapon.update` em todos os jogadores | Separar permissão de disparo da atualização de ataques já lançados; congelar cooldown no estado morto e iniciar respawn sem burst; V26 |
