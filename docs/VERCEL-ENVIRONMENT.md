# Auditoria de ambiente — LIMIAR

## Conclusão e limite da evidência

O código auditado corresponde ao commit local `72a7726` (antes desta correção).
O código original de `configurationError()` lê `process.env.DATABASE_URL` ao ser
chamado. Login/register já exportavam `dynamic = "force-dynamic"`, sem cache de
resultado, sem `use client` e sem runtime Edge. O `next.config.ts` original não contém `env`,
`DefinePlugin`, export estático, cacheComponents ou substituição de variáveis.
Não existe `vercel.json` ou vínculo `.vercel` neste checkout. Nenhuma escrita em
`process.env.DATABASE_URL` foi encontrada no código da aplicação.

**Não foi demonstrado um bug de inlining de DATABASE_URL.** A mensagem original
ocorre antes de abrir conexão: SSL, pooling, migrations e disponibilidade do Neon
não podem produzir aquele ramo específico. O build passar também não demonstra
que recebeu a variável: geração e build podem funcionar sem credenciais.

Não houve acesso ao painel/API autenticada da Vercel nem identificação confirmada
da URL afetada. A causa externa exata continua pendente de evidência de runtime.
Hipóteses, em ordem de probabilidade (inferência, não constatação do painel):

1. Deployment anterior à alteração das variáveis, ainda acessado por alias/domínio.
2. Outro projeto/team/deployment, ambiente Production/Preview ou Git branch.
3. Override de Preview específico da branch ou valor vazio/espaços.
4. Pipeline personalizado entregando variáveis apenas ao build, ou artefato
   prebuilt promovido para ambiente diferente. Não há esse pipeline no repositório.
5. Comportamento diferente no commit efetivamente publicado. Conferir SHA e logs.

Se o diagnóstico do deployment correto retornar `databaseUrlNonEmpty: false`,
**a indisponibilidade de DATABASE_URL passou a ser um problema de configuração/
deployment da Vercel, não de Prisma nem de leitura da variável pelo código**.
Nenhuma função TypeScript consegue recuperar uma variável que não foi injetada.

## Separação das fases

| Fase | O que acontece neste projeto |
|---|---|
| `npm install` / `npm ci` | Instala dependências; recebe o ambiente do processo de instalação. Não executa o carregamento de `.env` do Next. |
| `postinstall` | Executa `prisma generate`; preservado no `package.json`. Instalação com `--ignore-scripts` exige geração explícita. |
| `prisma generate` | Carrega `prisma.config.ts` e `dotenv/config`; produz TypeScript em `src/generated/prisma`. Não conecta ao banco nem executa migrations. Config aceita URL ausente. |
| `next build` | Compila servidor/browser e pré-renderiza rotas estáticas. Importar módulos não deve inicializar auth/banco. `NEXT_PUBLIC_REALTIME_URL` fica incorporada ao bundle. |
| Server Function da Vercel | Novo processo Node com ambiente do deployment. Não herda magicamente o `.env` local ou o processo do Prisma CLI. |
| Server Components | Login/register são dinâmicos; validação acontece na renderização da requisição. Home/offline não dependem do banco. |
| Server Actions | `auth-actions.ts` e `actions.ts` têm `use server`; imports pelos Client Components viram referências RPC. A implementação e secrets permanecem no servidor. |
| Browser | Recebe somente a configuração pública de realtime. `server-only` impede importar o ambiente privado em Client Components. Alterar a variável pública exige novo build. |

Referências: [Next — ambiente e build/runtime](https://nextjs.org/docs/app/guides/environment-variables),
[Vercel — deployments e overrides de ambiente](https://vercel.com/docs/environment-variables).
Também foi lida a documentação da versão instalada em `node_modules/next/dist/docs/`
e o coletor de variáveis estáticas em `node_modules/next/dist/lib/static-env.js`.

## Correções

- `src/server/env.ts`: fronteira `server-only`, leitura sob demanda, validações e
  mensagens sem valores. Não importa Prisma, não conecta ao banco e não exige
  credenciais no top-level. Secrets existentes mantêm seus bytes originais.
- `config.ts`, `db.ts`, `auth.ts`, `tickets.ts` usam essa fonte comum. Mensagens
  explicam o ambiente do servidor, sem orientar incorretamente a criar `.env` na Vercel.
- Node explícito nas páginas online e nos handlers. Sem banco, login/register
  explicam a indisponibilidade, account/solo redirecionam para login e auth API
  retorna 503. Home/offline continuam acessíveis.
- Better Auth exige origem HTTPS pública em produção. Sem fallback localhost.
- Realtime client exige WSS público em produção; configuração inválida mostra
  indisponibilidade sem pedir ticket, conectar a localhost ou repetir indefinidamente.
- `next.config.ts` fixa somente `NEXT_PUBLIC_REALTIME_URL` no build, inclusive
  quando ausente (string vazia). Assim o diagnóstico não confunde um valor público
  fornecido só em runtime com aquele realmente incorporado no browser. Nenhum
  secret é colocado em `next.config.env`.
- O worker valida `REALTIME_ORIGIN`, secret e porta no início do processo. A porta
  é interna ao VPS/container; configurar `REALTIME_PORT` na Vercel não inicia WS.
- Comandos Node que importam serviços protegidos usam `--conditions=react-server`,
  que resolve o marcador `server-only` para a exportação vazia no processo servidor.
  Isso foi aplicado ao script realtime, compose, runner Playwright e subprocesso
  de integração. Vitest simula somente o marcador, sem mudar a proteção do Next.
- Docker copia schema/config antes de `npm ci`: o postinstall precisa desses
  arquivos. Não foi executado build Docker nesta auditoria.

## Diagnóstico temporário em produção

Após publicar este código, abrir **`/api/debug/environment`** no domínio afetado
e na URL específica do deployment. O endpoint é público intencionalmente para
funcionar mesmo quando auth/banco estão indisponíveis. Só retorna uma lista fechada
de booleanos e metadados controlados. Não retorna URLs, partes de URLs, tamanhos de
secrets, hashes, tokens, mensagens de exceção ou dump de `process.env`.

Tem `runtime = "nodejs"`, `dynamic = "force-dynamic"` e `no-store` para navegador/CDN.
Não conecta ao banco. Exemplo dos campos decisivos:

```json
{
  "databaseUrlPresent": true,
  "databaseUrlNonEmpty": true,
  "betterAuthSecretPresent": true,
  "realtimeSecretPresent": true,
  "realtimeBuildUrlPresent": true,
  "realtimeBuildUrlValid": true,
  "nodeEnv": "production",
  "vercelEnv": "production",
  "vercelUrlPresent": true,
  "gitCommitSha": null
}
```

Exemplo ilustrativo, não resultado observado na Vercel. SHA será preenchido se
`VERCEL_GIT_COMMIT_SHA` estiver disponível; `null` não prova deployment incorreto.
Habilitar exposição das System Environment Variables se esses metadados faltarem.
`NODE_ENV=production` também ocorre em Preview; conferir `vercelEnv`.

| Resultado | Interpretação/próximo passo |
|---|---|
| `databaseUrlPresent=false` | Chave não existe na Server Function consultada. Conferir deployment/escopo. |
| `Present=true`, `NonEmpty=false` | String vazia ou apenas espaços nesse runtime. Conferir valor/override. |
| `NonEmpty=true`, login ainda diz que falta DATABASE_URL | Conferir se login e endpoint usam mesmo domínio/deployment/SHA, alias, cache de navegação e commit publicado. Não atribuir isso ao Neon. |
| `NonEmpty=true`, erro posterior de conexão/auth | Investigar rede, SSL, migrations, auth URL/secrets. Presença não testa conectividade. |
| `realtimeBuildUrlValid=false` | Corrigir a variável pública antes de novo build; runtime não conserta um bundle antigo. |

Remover **`src/app/api/debug/environment/route.ts`** depois do incidente, junto
das asserções/imports desse endpoint em `tests/environment.test.ts` e
`scripts/verify-environment.mjs`. Manter env.ts, validações e testes dos serviços.
Nenhum novo secret ou flag é necessário para ativar o diagnóstico.

## Checklist verificável na Vercel

1. Abrir o **team e projeto corretos**, confirmar repositório conectado e Root Directory.
2. Abrir o deployment efetivamente servido pelo domínio. Comparar sua URL exclusiva,
   Git branch e commit SHA com o endpoint e com o commit contendo esta correção.
3. Confirmar se é Production, Preview ou ambiente personalizado; conferir a Production Branch.
4. Conferir o domínio/alias em Settings → Domains e no deployment. Comparar as duas URLs.
5. Confirmar que o deployment foi **criado depois** da última alteração das variáveis.
   Mudanças no painel não atualizam deployments já existentes.
6. Conferir DATABASE_URL no escopo correto e todos os overrides por branch de Preview.
7. Conferir valor efetivamente não vazio, sem espaços acidentais ou conteúdo literal
   `DATABASE_URL=...`. Não copiar valor para tickets, prints públicos ou logs.
8. Revisar Install/Build Commands personalizados: nenhuma credencial deve existir
   somente num `export` de build ou em `build.env`. Framework preset: Next.js.
9. Fazer **novo deployment/redeploy sem reutilizar Build Cache**, a partir do commit
   correto e com o ambiente correto; comparar SHA e consultar o diagnóstico novamente.
10. Confirmar HTTPS em BETTER_AUTH_URL, WSS em NEXT_PUBLIC_REALTIME_URL (antes do build)
    e REALTIME_ORIGIN HTTPS no worker externo, exatamente igual à origem usada no browser.

Para Preview, usar URL de auth e origem autorizada correspondentes àquele Preview
e banco/worker de teste. Não adicionar wildcard de qualquer projeto `*.vercel.app`
como origem confiável. O servidor atual aceita uma origem exata.

## Prisma 7, Neon e migrations

Confirmados `prisma-client`, output `../src/generated/prisma`, imports de
`../generated/prisma/client`, versões 7.10.0 alinhadas e `@prisma/adapter-pg` com
`schema: "limiar"`. Todos os models e a migration inicial usam `limiar`.
`.gitignore` exclui `.env*` (exceto exemplo) e `src/generated`; não versionar o client.
`prisma.config.ts` configura o **CLI**, não a instância `PrismaPg` em runtime.

O adapter recebe connection string em runtime. O código preserva a conversão de
`sslmode=require` para `verify-full`; não desabilita validação de certificado.
Singleton por processo evita pools por request. Limite 8 é **por instância**, não
global; cold starts/concorrência multiplicam conexões. Foram adicionados limites de
10 s para conexão/ociosidade. Usar a conexão pooled do Neon no runtime quando houver
muitas instâncias, e acompanhar limites/latência na operação. Não migrar de adapter
ou desligar SSL para resolver ausência de variável.

Aplicar migrations como etapa controlada de release, uma vez por banco alvo:

```bash
npx prisma migrate status
npx prisma migrate deploy
```

Executar num job/terminal confiável com credenciais do banco alvo no ambiente,
confirmando branch Neon e backup/revisão da migration antes do deploy. Pode usar
conexão direta para o job, via DATABASE_URL do processo CLI; `schema=limiar` é
aplicado pelo config. Não executar em cada request, no postinstall, no Preview
apontando inadvertidamente para produção, nem usar `migrate reset`/`db push`.
Esta correção não executa migrations e não altera o schema.

## Reproduzir validações

```bash
npx prisma validate
npx prisma generate
npm run typecheck
npm run lint
npm test
npm run build
node scripts/verify-environment.mjs
```

O último comando usa DATABASE_URL e secrets já existentes no ambiente/`.env` local,
sem imprimi-los. Compila sem credenciais e com WSS de teste, inicia **o mesmo build**
com banco configurado e vazio, verifica HTML, diagnóstico, API 503 e offline no Chrome.
Confere WSS incorporado no JS e ausência de credenciais privadas nos bundles.
Não inicia o worker, não modifica `.env`, não aplica migrations nem escreve no Neon.
**Depois executar `npm run build` novamente antes de publicar**, porque o harness
deixa um artefato local com endereço WSS de teste.

Integração real (fixtures próprias; ambiente de teste):

```bash
RUN_DATABASE_TESTS=1 npm test -- tests/database.test.ts
```

Testes realtime completos não devem iniciar contra banco com partidas ativas:
o worker existente marca partidas RUNNING como INTERRUPTED ao reiniciar.

Proposta de regressão para §V/§B (backprop; SPEC.md não alterado): ambiente privado
lido sob demanda, build sem banco, offline preservado, diagnóstico sem secrets e
produção sem fallback localhost. Os testes em `environment.test.ts` e o harness
cobrem essa classe de falha; a causa externa da Vercel só deve ser registrada após
a observação do deployment afetado.

## Resultados desta execução — 16/09/2026

| Verificação | Resultado observado |
|---|---|
| `npx prisma validate` / `npx prisma generate` | Aprovados com a configuração local existente. |
| `DATABASE_URL='' npx prisma validate` / `DATABASE_URL='' npm run postinstall` | Aprovados sem URL; client gerado no diretório ignorado pelo Git. |
| `npm run typecheck` / `npm run lint` | Aprovados. |
| `npm test` | 39 aprovados; 5 integrações opcionais ignoradas nessa execução padrão. |
| `RUN_DATABASE_TESTS=1 npm test -- tests/database.test.ts` | 4 integrações reais aprovadas, incluindo auth/hash/login/logout. |
| Prisma em Node separado com `server-only` | Inicializou, executou SELECT e confirmou existência do schema limiar; sem impressão dos dados da conexão. |
| `npx prisma migrate status` | Schema atualizado; nenhuma migration executada. |
| Harness com build sem secrets | Aprovado: mesmo artefato responde à DATABASE_URL fornecida/vazia no runtime. |
| Chrome no harness | Login/register mostram formulário com configuração; sem banco mostram aviso; API retorna 503; account/solo redirecionam; offline inicia, move e salva. |
| Browser bundles | WSS de teste incorporado; secrets ausentes. Repetida varredura no build normal com secrets locais disponíveis: ausência confirmada. |
| `npm run build` final | Aprovado; login/register/diagnóstico/auth/account/solo dinâmicos, home/offline estáticos. Artefato de teste substituído pelo build normal. |
| `npm run test:browser -- --list` / ticket em Node separado | Runner carrega as três specs; assinatura/verificação funciona com a condição Node. |
| Vercel real / Docker / co-op multibrowser | Não executados nesta auditoria. Sem acesso ao deployment; worker não iniciado para não interromper partidas existentes. |

As tentativas iniciais de build/conexão dentro do sandbox falharam e passaram
fora dele. O primeiro harness encontrou seletor ambíguo (`alert` também pertence
ao anunciador de rotas do Next); corrigido e repetido com sucesso. Isso não foi
tratado como defeito de runtime da aplicação. A alteração prévia do usuário em
`next-env.d.ts` foi restaurada após o build regenerar esse arquivo.

## Arquivos alterados/adicionados

| Área | Arquivos |
|---|---|
| Ambiente privado e serviços | `src/server/env.ts` (novo), `config.ts`, `db.ts`, `auth.ts`, `tickets.ts` |
| Páginas e handlers | `src/app/login/page.tsx`, `register/page.tsx`, `account/page.tsx`, `solo/page.tsx`, `api/auth/[...all]/route.ts`, `api/debug/environment/route.ts` (novo) |
| Realtime/build público | `src/game/network/environment.ts` (novo), `src/game/network/client.ts`, `src/realtime/server.ts`, `next.config.ts` |
| Execução e container | `package.json`, `compose.yaml`, `Dockerfile` |
| Verificação | `tests/environment.test.ts` (novo), `tests/setup.ts` (novo), `tests/realtime.test.ts`, `vitest.config.ts`, `scripts/verify-environment.mjs` (novo) |
| Documentação | `README.md`, `docs/VERCEL-ENVIRONMENT.md` (novo) |

`prisma.config.ts`, schema, migrations, lockfile e postinstall preservados.
Nenhum commit, push ou deploy foi efetuado.
