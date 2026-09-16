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

## Produção

```bash
npm run build
npm run start
# Outro processo:
npm run realtime
```

Configure HTTPS/WSS e as URLs da aplicação. O processo WebSocket precisa ser persistente: não executá-lo dentro de uma função serverless. `compose.yaml` e `Dockerfile` fornecem a topologia web + realtime. Uma instância realtime; múltiplas réplicas exigem coordenação de salas. Não há deploy automático para GitHub Pages.

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
