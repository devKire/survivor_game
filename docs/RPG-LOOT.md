# Loot RPG — regras v1

A Fase 3 parte da main `4366298` (Fase 2 integrada pelo PR #13). O baseline
executado contém 240 testes padrão aprovados e 280 aprovados com PostgreSQL.
Os testes condicionais não foram considerados aprovados quando ignorados.

Loot usa os seis equipamentos e dois materiais existentes. Conteúdo estático em
`src/game/content/rpg/loot-tables.ts` é congelado recursivamente. Regras de
recompensa v1 são independentes das versões de save, economia, combate e item.
Uma sessão conserva sua versão; versões desconhecidas falham sem payout.

`completion-v1`: um equipamento garantido entre Lâmina Gasta, Manto de Cinzas e
Talismã do Obelisco, pesos iguais. Raridades: COMMON 80, RARE 18, EPIC 2,
LEGENDARY 0. `boss-v1`: cada um dos seis itens tem peso 10; Pó do Obelisco tem
peso 20 (2–4 unidades), Fragmento de Eco peso 20 (1–2). Itens cujo mínimo de
nível excede o nível congelado do personagem são excluídos antes de normalizar
pesos. Raridades de equipamento de boss: 60/32/7/1, na mesma ordem.

Nível do item: entre `max(1, nível de entrada - 2)` e o nível de entrada. O
requisito final continua sendo o maior entre nível da instância e mínimo da
definição. Itens para outro personagem podem cair, sem equipar automaticamente.
Toda instância tem quantidade 1, versão 1 e affixes produzidos pelo gerador
existente. Instâncias legadas com seed nula não são alteradas.

A seed raiz usa `randomBytes(32)` no servidor, separada da worldSeed. HMAC-SHA256
deriva entropia por sessão, usuário, fonte, evento, índice e versão, codificados
como array JSON sem ambiguidades. O domínio puro recebe essa entropia explícita;
não usa Math.random ou IO. As primeiras palavras de 32 bits escolhem entrada,
raridade e nível; `rollEquipmentAffixes` reproduz os affixes pela seed derivada.
IDs determinísticos de instância usam 128 bits da derivação para manter replay.

## Política inicial

Expedição em Ruínas, dificuldade normal, duração 600 segundos; identidade
RPG_EXPEDITION separada da dificuldade. Vitória dá XP 100, pó 4, fragmento 1 e
o roll de conclusão. Boss: XP 20, pó 2, fragmento 1 e um roll (máximo 3).
Elite: XP 2 e pó 1 (máximo 6). Cofre realmente aberto: XP 3 e pó 2 (máximo 3
por usuário). Inimigos comuns e baús temporários de boss não geram fonte extra.

Limites por usuário/sessão: XP 200 (combinação atual máxima 181), pó 40,
fragmentos 12, equipamentos 4, rolls 4. Limite de eventos 24 para cinco pessoas.
Elegibilidade: vitória, 360 segundos conectado, 30 segundos de movimento real
computado no servidor e ausência final de até 60 segundos. Essa é proteção
contra inatividade evidente, não um detector completo de bots. Derrota e
participação inelegível dão zero; reconectar não cria novo direito.

Teste de domínio cobre 3.000 rolls de conclusão, 1.000 de boss, pesos,
determinismo, versões, fontes, limites e isolamento de fontes pessoais.
