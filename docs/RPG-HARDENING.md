# Fase 1.5 — auditoria e validação

Base inspecionada: `main`, `9378aa802813eca177428f0d6381da1ef8c107f4`.

## Auditoria inicial

| Área | Estado encontrado | Correção/validação necessária |
| --- | --- | --- |
| Separação Survivor/RPG | Completa: tabelas e módulos próprios, sem grants de saves | Manter contratos e testar import/sync e economia em paralelo |
| Ownership | FKs compostas isolam equipamento/personagem por usuário | Testar também personagem ativo, consultas e exclusão completa |
| Cascatas | Testes existentes removem apenas perfis sem itens equipados | Exercitar ciclo perfil → personagem ativo e filhos equipados no PostgreSQL |
| Itens | Slots, raridade e quantidades limitados; slot único por personagem | Falta impedir equipamento de uma pilha com quantidade maior que um |
| Concorrência | Seleção usa Serializable e revisão própria | Não há retry de abortos de serialização nem testes simultâneos |
| Idempotência | Recibo por usuário/requestId e hash do comando | Testar concorrência, replay antigo, payload divergente e rollback real |
| Atributos | Ausentes | Definir saldo derivável e persistência consistente com nível |
| Actions | Autenticação na borda; flag apenas na action/página | Campos FormData extras são descartados; erros lançados quebram formulário; serviços diretos ignoram flag |
| Leitura | Toda consulta executa upsert/createMany e FOR UPDATE | Separar leitura consistente sem locks de escrita de inicialização lazy |
| Compatibilidade | Testes básicos de constantes e ausência de campos | Ampliar regressões funcionais e executar banco/realtime/browser |

Esta entrega não adiciona equipamentos funcionais, fontes de XP, loot, affixes, crafting, quests nem modificadores de combate.

## Correções entregues

- Atributos persistentes com inicialização, distribuição, limites e saldo derivado: `attributePoints + sum(attributes) = 5 * (level - 1)`. A regra existe no domínio puro e no PostgreSQL, inclusive para escritas fora do Prisma. Não há operação de XP/level-up nem efeito no combate.
- Mutação e inicialização `Serializable`, lock de `UserProgress`, revisão RPG, recibo atômico e até três tentativas para abortos seguros. Os testes expuseram SQLSTATE `40001` encapsulado em `P2010` e conflitos do adapter no commit; o classificador também reconhece `P2034`. Erros ambíguos de conexão não são repetidos automaticamente.
- Replay consulta o receipt antes da reconciliação. Payload/operation divergentes falham; fingerprints antigos continuam aceitos. Nenhuma operação exclusivamente RPG altera `UserProgress.version` ou seus dados.
- Leitura completa usa snapshot `RepeatableRead`, sem lock de escrita. Um teste mantém locks de conta/perfil abertos e confirma que a leitura retorna sem esperá-los e sem modificar timestamps.
- Actions autenticam antes de mutar, ignoram apenas metadados de transporte do React e rejeitam chaves extras, `userId`, arquivos, duplicatas e coerções numéricas. Erros internos são genéricos; conflitos de revisão aparecem no formulário. Campos e requestId sobrevivem ao reset automático de forms do React após erro.
- Flag aplicada também nos serviços internos e no layout. A seleção e a alocação nunca recebem a identidade do usuário do cliente.

## Migração e integridade

Criada somente `prisma/migrations/20261008180000_rpg_foundation_hardening/migration.sql`; a migração da Fase 1 permanece intacta.

A migração adiciona `RpgCharacter.attributePoints` e `attributes`, inicializa o saldo segundo o nível já persistido e impõe o orçamento e formato dos cinco atributos. Adiciona a regra `quantity = 1` para itens equipados. Pilhas anteriormente equipadas voltam ao inventário, preservando IDs, quantidades e todos os demais dados; não há deleção de itens.

As FKs compostas atuais **não precisaram de alteração**. A exclusão da conta com perfil, personagem ativo, vários personagens, inventário, equipamento, materiais e receipts passou em PostgreSQL. Excluir isoladamente um personagem referenciado continua bloqueado. Também foram rejeitados slot inválido/duplicado, raridade inválida, quantidades fora do limite, pares incompletos e referências a personagem ativo/equipado de outro usuário.

O histórico completo de nove migrações foi aplicado por `prisma migrate deploy` em banco local isolado vazio. Dois testes adicionais aplicam o SQL real em bancos temporários exclusivos: instalação vazia e upgrade com dados compatíveis com a Fase 1 (nível/XP, perfil ativo, pilha equipada, item equipado unitário, materiais e receipt antigo). Conferem preservação de saves, moedas, desbloqueios, versões e dados, além das novas constraints e cascata. Não houve aplicação em produção.

## Testes adicionados e ampliados

| Arquivo | Cobertura |
| --- | --- |
| `tests/rpg-attributes.test.ts` | Níveis 1–100, orçamento, teto 99, imutabilidade, gastos e evolução repetida sem pontos duplicados |
| `tests/rpg-hardening-database.test.ts` | 16 testes PostgreSQL: lazy concorrente, leitura sem locks, unlock posterior, mesmo/diferente requestId, revisão simultânea, replay Fase 1, atributos, economia paralela, conflito Serializable real, rollback após update/receipt/commit, ownership, saves sem grants, flag e cascatas |
| `tests/rpg-migrations.test.ts` | Instalação vazia e upgrade Fase 1 em bancos descartáveis, sem reset do banco configurado |
| `tests/rpg-transaction.test.ts` | Classificação estrita dos abortos, limite de três tentativas, falhas ambíguas sem retry |
| `tests/rpg-actions.test.ts` | Flag, autenticação, sessão versus payload forjado, validação estrita, callbacks seguros e erros sem detalhes internos |
| `tests/rpg-compatibility.test.ts` | Save/restore Survivor, quatro slots, seed/worldVersion, XP temporário e estatísticas PvP independentes da alocação RPG |
| `tests/rpg-core.test.ts`, `tests/rpg-service.test.ts`, `tests/rpg-database.test.ts` | Deduplicação de unlocks, limites/coerções, reconciliação com revisão própria e contratos existentes |
| `tests/browser/rpg.spec.ts` | 404 com flag off; autenticação/callbacks com flag on; registro, alocação persistida, duas abas, erro inline, intenção preservada e seleção após refresh sem modificar Survivor |

## Resultados reais — 2026-10-08

Ambiente: Node 22.23.3, PostgreSQL 18.4 local em banco isolado `limiar_rpg_hardening_20261008`, Prisma 7.10.0, Next 16.3.5 e Chromium 151.0.7922.173. Para o navegador foi usado `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; Chrome permanece o padrão do repositório quando a variável não é definida. Os comandos receberam as variáveis locais por um wrapper fora do checkout, sem credenciais versionadas.

| Comando | Resultado efetivamente executado |
| --- | --- |
| `npx prisma validate` | Aprovado |
| `npx prisma generate` | Aprovado |
| `npx prisma migrate deploy` | Nove migrações aplicadas no banco isolado vazio |
| `npm run typecheck` | Aprovado após o build final |
| `npm run lint` | Zero erros; aviso preexistente de `TAU` não utilizado em `src/game/client/browser.ts:28` |
| `npm test` | 218 aprovados, 32 ignorados por dependerem das flags de integração/realtime |
| `RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test` | **249 aprovados**, 1 ignorado (realtime, executado separadamente) |
| `RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts` | **1 aprovado**, cinco clientes reais, autoridade/latência/resync/reconexão |
| `npm run build` | Aprovado, incluindo as duas rotas RPG dinâmicas |
| `RPG_ENABLED=false npm run test:browser` | **6 aprovados, 2 falhos, 2 ignorados**; falhas nos testes legados de estabilidade de 2 e 5 clientes |
| `RPG_ENABLED=true npm run test:browser -- tests/browser/rpg.spec.ts` | **2 aprovados, 1 ignorado** (caso exclusivo de flag off, aprovado na execução anterior) |
| `RPG_ENABLED=false npm run test:browser -- tests/browser/stability.spec.ts` no commit-base | **2 falhos**, com a mesma asserção dos dois testes de estabilidade |

Os casos ignorados por flag não são contabilizados como aprovados. A suíte completa de navegador **não está verde**. Economia, offline, co-op com 2/3 clientes e as três condições RPG passaram nas execuções correspondentes.

### Diagnóstico das falhas e tentativas anteriores

- A primeira execução de navegador desta retomada não iniciou porque o PostgreSQL estava parado; foi reiniciado e a suíte efetivamente executada.
- A execução simultânea de arquivos de integração atingiu o limite seguro de retries na inicialização. As suítes que instalam triggers de falha em tabelas compartilhadas agora rodam sequencialmente com `RUN_DATABASE_TESTS=1`. As disputas reais entre transações dentro dos testes continuam simultâneas.
- Uma repetição de autenticação em menos de 60 segundos recebeu HTTP 429; o teste seguinte dependia da fixture desse cadastro e também falhou. Após a janela do limitador, a execução completa acima passou, sem desabilitar limites.
- O primeiro teste de formulário detectou nome acessível ambíguo no select e reset do atributo após erro. O label passou a ser associado por ID e o formulário preserva a intenção no reset. A execução final com RPG ligado passou sem erros de página.
- Os testes legados de estabilidade esperam `remoteGameInstances === 1` após 60 segundos e receberam `0`; os relatórios também indicam `rafLoops=0`, nenhum resync e nenhum erro de console. O último frame do trace de dois clientes mostra o lobby com “A equipe caiu”, indicando partida encerrada. As duas falhas foram reproduzidas com o código da `main` verificada, em cópia temporária do commit-base, usando os mesmos testes e dependências, apenas adaptando o executável do navegador e as portas. O teste precisa distinguir encerramento de partida de vazamento/duplicação de instâncias; não foi relaxado nem foi alterado o gameplay para mascará-lo.

Logs, traces e relatórios das execuções estão no diretório local ignorado `artifacts/rpg-hardening/`. Não foram sobrescritos os snapshots ou relatórios históricos versionados do Survivor.

## Arquivos de implementação alterados

- Banco: `prisma/schema.prisma` e a nova migração SQL descrita acima.
- Domínio: `src/game/core/rpg/{attributes,index,rules,types}.ts`.
- Serviços: `src/server/rpg/{actions,guard,mutations,profile,transaction}.ts`.
- Páginas: `src/app/rpg/layout.tsx`, `src/app/rpg/character/{page,CharacterForms}.tsx`, `src/app/rpg/inventory/page.tsx`.
- Testes: todos os arquivos da tabela de cobertura; `playwright.config.ts` para Chromium opcional e `vitest.config.ts` para isolamento entre suítes de banco.
- Documentação: `docs/RPG-ARCHITECTURE.md`, `docs/RPG-BASELINE.md`, `docs/RPG-HARDENING.md`.

O catálogo separado `src/game/content/rpg/` foi auditado e mantido. Não houve alteração em `src/server/economy.ts`, `src/server/progress.ts`, core Survivor fora de `core/rpg`, rede ou realtime.

## Riscos residuais e entrega

- A falha legada de estabilidade de navegador permanece registrada; não há alegação de aprovação integral do navegador nem certificação de desempenho em produção.
- A migração usa transação e `lock_timeout=5s`; o backfill e validação de CHECKs exigem locks nas tabelas RPG. Dimensionar a janela em produção. Em aborto, tratar a tentativa falha com o fluxo `prisma migrate resolve --rolled-back` antes de reaplicar, nunca resetar dados.
- `prisma migrate diff` ainda aponta diferenças preexistentes de ações de FKs em tabelas antigas de economia/arena/ranked; não aponta diferença nos modelos RPG e não foi aplicado. CHECKs e função SQL precisam continuar sendo mantidos pelas migrações.
- Sob contenção sustentada, três abortos transitórios retornam feedback para retry com o mesmo pedido. Isso evita loops sem limite. Falha de conexão com commit desconhecido exige esse replay explícito.
- Inventário é lido integralmente e receipts são retidos. Paginação e política de retenção precisarão ser definidas antes de grandes volumes na Fase 2, sem perder garantias de replay.

Survivor e PvP permanecem preservados no escopo verificado: `SAVE_SCHEMA=3`, `ECONOMY_VERSION=2`, `RunState`, `RunSnapshot`, `Player.level`/XP temporário, quatro slots, seed/worldVersion, estruturas/procedural, snapshots multiplayer, Ranked e GOLD/GEMS não foram modificados. As suítes existentes de domínio/economia/PvP e o teste realtime passaram. Nenhuma recompensa persistente depende de valores declarados pelo cliente. A Fase 2 não foi iniciada.

Branch: `codex/rpg-phase1-hardening`, baseada em `9378aa802813eca177428f0d6381da1ef8c107f4` (origin/main reconferida). Commits separados para auditoria, schema/regras, serviços/concorrência, actions/formulários e relatório final; PR destinado a `main`, sem merge automático.
