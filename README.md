# LIMIAR — ECOS DO OBELISCO

Survivor-like Canvas com solo local, solo salvo na conta e co-op autoritativo para até cinco jogadores.

## Executar

Requer Node.js 22 e PostgreSQL/Neon.

```bash
npm ci
# Instalação nova: copie .env.example para .env e configure os valores.
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npm run dev
```

Em outro terminal:

```bash
npm run realtime
```

Abra **http://localhost:3000**. Crie contas, crie uma equipe, compartilhe o código, marque PRONTO e inicie a expedição. Movimento: WASD/setas; interação/revive: E; itens: 1–4; chat: Enter; build: Esc/P. No co-op o painel de build não pausa a sala.

`DATABASE_URL` é obrigatória para recursos online. Gere segredos independentes (`openssl rand -base64 48`) para `BETTER_AUTH_SECRET` e `REALTIME_SECRET`. Nunca coloque credenciais no código ou em variáveis `NEXT_PUBLIC_*`.

## Modos e saves

- **Jogar offline:** simulação e save local, sem depender do servidor realtime.
- **Solo salvo na conta:** simulação local; arquivo solo sincronizado, com detecção de conflito e cache de recuperação.
- **Modo equipe:** servidor calcula movimentos, combate, XP e recompensas. Banco recebe apenas dados persistentes e resultado final.
- Importação de legado é explícita. Preserva o arquivo solo e configurações; ouro/achievements locais não viram recompensas verificadas de co-op.
- Saves antigos, resume, export/import, personagens, armas, mapas e modos continuam disponíveis. A baseline original está em `baseline/v1.3.0/`; os três arquivos originais na raiz também foram mantidos como referência histórica.

## RPG (rollout controlado)

`RPG_ENABLED=false`, `RPG_EXPEDITIONS_ENABLED=false`, `RPG_REFUGE_ENABLED=false` e `RPG_EXPLORATION_ENABLED=false` são os padrões seguros.
A exploração usa RPG_ENABLED e RPG_EXPLORATION_ENABLED no web e realtime; entrada em `/rpg/exploration` ou no portal do Refúgio. Veja [região, gathering e segurança](docs/RPG-EXPLORATION.md).
O Refúgio requer RPG e sua flag própria; consulte [cena, serviços e Depósito](docs/RPG-REFUGE.md).
Após aplicar as migrações e integrar toda a Fase 3, habilite ambas no processo web
e realtime de um ambiente de validação. Acesse `/rpg`, prepare o personagem e
escolha **Expedição RPG** no lobby. Todos ficam prontos antes de START.
Ruínas/normal/10 minutos são a configuração inicial autorizada; Survivor continua
separado. Recompensas confirmadas aparecem em `/rpg/rewards` e no inventário RPG.

Consulte [regras e recuperação](docs/RPG-REWARDS.md),
[segurança](docs/RPG-REWARD-SECURITY.md), [QA e PRs](docs/RPG-PHASE3-QA.md)
e [plano das próximas fases](docs/RPG-ROADMAP.md).

Validação completa em banco temporário, sem jogadores ativos:

```bash
RUN_DATABASE_TESTS=1 RUN_MIGRATION_TESTS=1 npm test
RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts tests/rpg-equipment-realtime.test.ts tests/rpg-expedition-realtime.test.ts
RPG_ENABLED=true RPG_EXPEDITIONS_ENABLED=true RPG_EXPEDITION_BROWSER_DRIVER=1 npm run test:browser
RPG_ENABLED=false RPG_EXPEDITIONS_ENABLED=false npm run test:browser -- tests/browser/rpg.spec.ts
RUN_RPG_BENCHMARK=1 RPG_ENABLED=true RPG_EXPEDITIONS_ENABLED=true node --expose-gc --conditions=react-server --import tsx scripts/rpg-rewards-benchmark.ts
```

O driver de navegador acima é exclusivo de testes, acelera ticks do motor real
e não deve integrar o comando realtime de produção. Use Next dev em localhost,
sem desativar as proteções HTTPS de produção. Veja o relatório para falhas
preexistentes de estabilidade do navegador.

## Produção

```bash
npm run build
npm run start
# Outro processo:
npm run realtime
```

Configure HTTPS/WSS e as URLs da aplicação. O processo WebSocket precisa ser persistente: não executá-lo dentro de uma função serverless. `compose.yaml` e `Dockerfile` fornecem a topologia web + realtime. Uma instância realtime; múltiplas réplicas exigem coordenação de salas. Não há deploy automático para GitHub Pages.

Na Vercel, siga a [auditoria de ambiente e checklist de deployment](docs/VERCEL-ENVIRONMENT.md).
`BETTER_AUTH_URL` exige HTTPS e `NEXT_PUBLIC_REALTIME_URL` exige WSS em produção;
esta última precisa existir durante o build. O comando realtime usa a condição
Node `react-server` para importar os mesmos serviços protegidos por `server-only`.

## Verificação

```bash
npm test
npm run lint
npm run typecheck
npm run build
npx prisma validate
npx prisma generate
npx prisma migrate status
RUN_DATABASE_TESTS=1 npm test -- tests/database.test.ts
RUN_REALTIME_TESTS=1 npm test -- tests/realtime.test.ts
npm run test:browser
node --import tsx scripts/benchmark.ts
node --import tsx scripts/balance.ts
```

Os testes de integração criam e removem somente suas próprias fixtures. Execute os testes realtime/browser sequencialmente: cada servidor é uma autoridade exclusiva para as partidas persistidas no ambiente. Não execute testes contra um ambiente de jogadores ativos.

## Documentação

- [Auditoria do projeto original](docs/AUDIT.md)
- [Arquitetura, operação e fonte de verdade](docs/ARCHITECTURE.md)
- [Relatório de entrega e validação](docs/DELIVERY.md)
- [Invariantes e regressões](SPEC.md)

Os scripts `extract-engine.py`, `type-engine.mjs`, `coop-hooks.py` e `organize.mjs` registram etapas históricas da migração. **Não os reexecute no código atual**: a extração já foi concluída.


## Fase 6 — narrativa persistente

Missões, diálogos e escolhas usam [domínio versionado](docs/RPG-QUESTS.md), provas duráveis das fases anteriores e resgate transacional. Rollout `RPG_QUESTS_ENABLED=false`; sem alterações em snapshots, economia Survivor ou combate. Consulte o [relatório de QA](docs/RPG-PHASE6-QA.md). A Fase 7 não foi iniciada.
