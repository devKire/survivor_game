# Fase 3 — Coleção e loja

Antes: só consumíveis temporários de run. Agora: UserCosmetic com propriedade única
por conta/item; catálogo cosmético versionado de 50 variantes em dez tipos/cinco
raridades. Loadout reutiliza UserProgress.data.cosmetics e é validado contra propriedade.
Loja /shop e Coleção /collection: filtro, preview, rarity, owned/locked/equipped,
compra Gold/Gems, equip/desequip. Categorias sem ofertas explicitamente vazias;
nenhum consumível de poder implementado. Cosméticos não entram em stats/hitboxes.

Migrations: 20260923220000_cosmetics aplicada. Compra bloqueia carteira, verifica
propriedade, debita, cria item e registra ledger em uma única transação. Retry de item
já adquirido não debita novamente. Equip exige propriedade e sessão autenticada.
Preço comum 30 Ouro ou 300 Gemas; raridades superiores 100/250/600/1500 Ouro.

Renderer Canvas recebe loadout da autoridade: tint de personagem/projétil, ornamento
de arma, rastro, selo/moldura, emote periódico e efeitos de spawn/evolução/derrota.
Mesmo core, mesmas hitboxes. Saves antigos recebem cosmetics vazio; arquivo solo
continua isolado. Catálogo puramente visual não contém campos de atributos.

Typecheck e Prisma generate passaram. Bateria adicional dispensada por orientação do
usuário. Não há cobrança em dinheiro real nem deploy da aplicação neste checkpoint.
