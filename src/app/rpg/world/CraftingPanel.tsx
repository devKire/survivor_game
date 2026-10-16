"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorldTransport } from "./WorldActionContext";
import type { CraftingCatalogData } from "../../../server/rpg/crafting/catalog";
import {
  craftingResultSchema,
  type CraftingCommand,
  type CraftingResult,
  type MaterialAmount,
} from "../../../game/core/rpg/crafting/types";
import { RPG_MATERIALS, RPG_ITEMS } from "../../../game/content/rpg/catalog";
import styles from "./crafting.module.css";
type Station = "refuge:forge" | "refuge:refinery" | "refuge:trader";
const operationNames = {
  CRAFT_ITEM: "Fabricação",
  REFINE_MATERIAL: "Refinamento",
  UPGRADE_ITEM: "Aprimoramento",
  REFORGE_ITEM: "Reforja",
  BUY_FROM_VENDOR: "Compra",
  SELL_TO_VENDOR: "Venda",
};
const rarityNames = {
  COMMON: "Comum",
  RARE: "Rara",
  EPIC: "Épica",
  LEGENDARY: "Lendária",
};
function materialName(id: string) {
  return RPG_MATERIALS[id as keyof typeof RPG_MATERIALS]?.name ?? id;
}
function itemName(id: string) {
  return RPG_ITEMS[id as keyof typeof RPG_ITEMS]?.name ?? id;
}
export default function CraftingPanel({
  stationId,
  enabled,
}: {
  stationId: Station;
  enabled: boolean;
}) {
  const transport = useWorldTransport()!,
    rpc = transport.rpc;
  const [catalog, setCatalog] = useState<CraftingCatalogData>(),
    [tab, setTab] = useState(
      stationId === "refuge:forge"
        ? "CRAFT"
        : stationId === "refuge:trader"
          ? "BUY"
          : "REFINE",
    );
  const [intent, setIntent] = useState<CraftingCommand>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<CraftingResult>();
  const [history, setHistory] = useState<{
    records: CraftingResult[];
    next: string | null;
  }>();
  const load = useCallback(async () => {
    const data = await rpc("CRAFTING_CATALOG", { stationId });
    setCatalog(data as CraftingCatalogData);
  }, [rpc, stationId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void rpc("CRAFTING_CATALOG", { stationId })
      .then((v) => {
        if (live) setCatalog(v as CraftingCatalogData);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [rpc, stationId, enabled]);
  async function loadHistory(cursor?: string) {
    setBusy(true);
    setError("");
    try {
      const page = (await rpc("CRAFTING_HISTORY", {
        stationId,
        ...(cursor ? { cursor } : {}),
      })) as { records: unknown[]; next: string | null };
      setHistory({
        records: page.records.map((r) => craftingResultSchema.parse(r)),
        next: page.next,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Histórico indisponível.");
    } finally {
      setBusy(false);
    }
  }
  function begin(details: Record<string, unknown>) {
    if (!catalog) return;
    setResult(undefined);
    setError("");
    setIntent({
      ...details,
      catalogVersion: 1,
      expectedRevision: catalog.revision,
      requestId: crypto.randomUUID(),
    } as CraftingCommand);
  }
  async function submit() {
    if (!intent) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = craftingResultSchema.parse(
        await rpc(intent.operation, intent),
      );
      setResult(confirmed);
      setIntent(undefined);
      transport.refresh();
      await load().catch(() =>
        setError(
          "Operação confirmada. Atualize os dados para consultar o saldo atual.",
        ),
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar. Repita o mesmo pedido.",
      );
    } finally {
      setBusy(false);
    }
  }
  const amount = (id: string) =>
    catalog?.materials.find((m) => m.materialId === id)?.amount ?? 0;
  const affordable = (materials: readonly MaterialAmount[], gold = 0) =>
    !!catalog &&
    catalog.gold >= gold &&
    materials.every((m) => amount(m.materialId) >= m.amount);
  const costs = (materials: readonly MaterialAmount[], gold = 0) => (
    <ul className={styles.costs}>
      {gold > 0 && (
        <li>
          GOLD: {catalog?.gold ?? 0} / {gold}
        </li>
      )}
      {materials.map((m) => (
        <li key={m.materialId}>
          {materialName(m.materialId)}: {amount(m.materialId)} / {m.amount}
          {amount(m.materialId) < m.amount
            ? ` · faltam ${m.amount - amount(m.materialId)}`
            : ""}
        </li>
      ))}
    </ul>
  );
  const confirmation = (() => {
    if (!intent || !catalog) return null;
    if (intent.operation === "CRAFT_ITEM") {
      const r = catalog.recipes.find((r) => r.id === intent.recipeId)!;
      return { name: r.name, materials: r.materials, gold: 0, credit: 0 };
    }
    if (intent.operation === "REFINE_MATERIAL") {
      const r = catalog.refinements.find((r) => r.id === intent.recipeId)!;
      return { name: r.name, materials: r.materials, gold: 0, credit: 0 };
    }
    if (intent.operation === "BUY_FROM_VENDOR") {
      const r = catalog.stocks.find((r) => r.id === intent.stockItemId)!;
      return {
        name: r.name,
        materials: r.cost.materials,
        gold: r.cost.gold,
        credit: 0,
      };
    }
    const r = catalog.items.find((r) => r.id === intent.instanceId)!;
    const plan = intent.operation === "UPGRADE_ITEM" ? r.upgrade : r.reforge;
    return {
      name: `${r.name} · ${rarityNames[r.rarity]} · …${r.id.slice(-8)}`,
      materials: intent.operation === "SELL_TO_VENDOR" ? [] : plan!.materials,
      gold: 0,
      credit: intent.operation === "SELL_TO_VENDOR" ? r.saleGold : 0,
    };
  })();
  if (!enabled)
    return <p>A Forja dos Ecos ainda não está disponível neste ambiente.</p>;
  const tabs =
    stationId === "refuge:forge"
      ? [
          ["CRAFT", "Fabricar"],
          ["UPGRADE", "Aprimorar"],
          ["REFORGE", "Reforjar"],
          ["HISTORY", "Histórico"],
        ]
      : stationId === "refuge:trader"
        ? [
            ["BUY", "Comprar"],
            ["SELL", "Vender"],
            ["HISTORY", "Histórico"],
          ]
        : [
            ["REFINE", "Refinar"],
            ["HISTORY", "Histórico"],
          ];
  return (
    <section className={styles.panel} aria-label="Serviço econômico do Refúgio">
      <nav aria-label="Serviços da estação">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            disabled={busy || !!intent}
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setResult(undefined);
              if (key === "HISTORY") void loadHistory();
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {catalog && (
        <p data-testid="forge-wallet">
          {catalog.characterId} · nível {catalog.level} · GOLD {catalog.gold} ·
          revisão {catalog.revision}
        </p>
      )}
      {error && (
        <p role="alert">
          {error} Se houve interrupção, repita a mesma confirmação para
          recuperar o resultado.
        </p>
      )}
      {result && (
        <div role="status" className={styles.confirmed}>
          <strong>
            {operationNames[result.operation]}{" "}
            {result.operation === "UPGRADE_ITEM" ||
            result.operation === "REFINE_MATERIAL"
              ? "confirmado"
              : "confirmada"}
            .
          </strong>
          {result.item && (
            <p>
              {itemName(result.item.itemId)} · {rarityNames[result.item.rarity]}{" "}
              · nível {result.item.level}
              {result.operation === "CRAFT_ITEM" ||
              result.operation === "BUY_FROM_VENDOR"
                ? " · enviado ao inventário, desequipado."
                : " · mesma instância atualizada."}
            </p>
          )}
          {result.gains.gold > 0 && <p>+{result.gains.gold} GOLD</p>}
          {result.gains.materials.map((m) => (
            <p key={m.materialId}>
              +{m.amount} {materialName(m.materialId)}
            </p>
          ))}
          {result.item?.affixes.map((a) => (
            <p key={a.id}>
              {a.id}: {a.value} (tier {a.tier})
            </p>
          ))}
        </div>
      )}
      {intent && (
        <section
          role="group"
          aria-label="Confirmar operação"
          className={styles.confirmation}
        >
          <h3>
            Confirmar{" "}
            {operationNames[intent.operation].toLocaleLowerCase("pt-BR")}?
          </h3>
          {confirmation && (
            <>
              <h4>{confirmation.name}</h4>
              {costs(confirmation.materials, confirmation.gold)}
              {confirmation.credit > 0 && (
                <p>Receber: {confirmation.credit} GOLD</p>
              )}
            </>
          )}
          <p>A operação será confirmada pelo servidor.</p>
          {(intent.operation === "REFORGE_ITEM" ||
            intent.operation === "UPGRADE_ITEM") && (
            <p>
              Os affixes atuais serão substituídos. O novo resultado pode ser
              diferente e não garante melhora. O ID e o proprietário serão
              preservados.
            </p>
          )}
          {intent.operation === "SELL_TO_VENDOR" && (
            <p>
              O equipamento será removido do inventário. A venda não possui
              recompra automática.
            </p>
          )}
          <button disabled={busy} onClick={() => void submit()}>
            {busy ? "Confirmando…" : "Confirmar"}
          </button>
          <button disabled={busy} onClick={() => setIntent(undefined)}>
            Cancelar
          </button>
        </section>
      )}
      {!catalog && !error && <p>Consultando catálogo e materiais…</p>}
      <button
        disabled={busy}
        onClick={() => {
          if (intent) return;
          void load().catch((e) => setError(e.message));
        }}
      >
        Atualizar dados
      </button>
      {catalog && (
        <div className={styles.list}>
          {tab === "CRAFT" &&
            catalog.recipes.map((r) => (
              <article key={r.id} aria-label={r.name}>
                <h3>
                  <span aria-hidden="true">
                    {r.slot === "WEAPON" ? "⚒" : r.slot === "ARMOR" ? "▰" : "◇"}
                  </span>{" "}
                  {r.name}
                </h3>
                <p>
                  {r.slot} · {rarityNames[r.rarity]} · nível {r.itemLevel} ·
                  receita v{r.version}
                </p>
                {costs(r.materials)}
                {r.requirements.length > 0 && (
                  <p>Requer: Os Ecos da Matéria recompensada.</p>
                )}
                {r.reason && <p>{r.reason}</p>}
                <p>Uma instância no inventário; não equipa automaticamente.</p>
                <button
                  disabled={
                    busy || !!intent || !!r.reason || !affordable(r.materials)
                  }
                  onClick={() =>
                    begin({
                      operation: "CRAFT_ITEM",
                      recipeId: r.id,
                      recipeVersion: r.version,
                    })
                  }
                >
                  Fabricar {r.name}
                </button>
              </article>
            ))}
          {tab === "REFINE" &&
            catalog.refinements.map((r) => (
              <article key={r.id}>
                <h3>{r.name}</h3>
                {costs(r.materials)}
                <p>
                  Resultado: {r.output.amount}{" "}
                  {materialName(r.output.materialId)} · receita v{r.version}
                </p>
                <p>
                  {catalog.remaining.REFINE_MATERIAL} refinamentos restantes
                  hoje, por conta.
                </p>
                <button
                  disabled={
                    busy ||
                    !!intent ||
                    !catalog.remaining.REFINE_MATERIAL ||
                    !affordable(r.materials)
                  }
                  onClick={() =>
                    begin({
                      operation: "REFINE_MATERIAL",
                      recipeId: r.id,
                      recipeVersion: r.version,
                    })
                  }
                >
                  Refinar resíduos
                </button>
              </article>
            ))}
          {tab === "BUY" &&
            catalog.stocks.map((s) => (
              <article key={s.id} aria-label={s.id}>
                <h3>{s.name}</h3>
                <p>Comum · nível 1 · uma unidade</p>
                {costs(s.cost.materials, s.cost.gold)}
                <button
                  disabled={
                    busy ||
                    !!intent ||
                    !catalog.remaining.BUY_FROM_VENDOR ||
                    !affordable(s.cost.materials, s.cost.gold)
                  }
                  onClick={() =>
                    begin({
                      operation: "BUY_FROM_VENDOR",
                      vendorId: "refuge:trader",
                      stockItemId: s.id,
                    })
                  }
                >
                  Comprar {s.name}
                  {s.cost.gold ? " com GOLD" : " por escambo"}
                </button>
              </article>
            ))}
          {(tab === "UPGRADE" || tab === "REFORGE" || tab === "SELL") &&
            catalog.items.map((i) => {
              const plan = tab === "UPGRADE" ? i.upgrade : i.reforge;
              const reason =
                tab === "UPGRADE"
                  ? i.upgradeReason
                  : tab === "REFORGE"
                    ? i.reforgeReason
                    : i.saleReason;
              const operation =
                tab === "UPGRADE"
                  ? "UPGRADE_ITEM"
                  : tab === "REFORGE"
                    ? "REFORGE_ITEM"
                    : "SELL_TO_VENDOR";
              return (
                <article key={i.id} aria-label={`${i.name} ${i.id}`}>
                  <h3>
                    {i.name} · {rarityNames[i.rarity]}
                  </h3>
                  <p>
                    Nível {i.level} · {i.equipped ? "Equipado" : "Inventário"} ·
                    …{i.id.slice(-8)}
                  </p>
                  <p>
                    Atributos atuais:{" "}
                    {i.modifiers.map((m) => `${m.stat} ${m.value}`).join(" · ")}
                  </p>
                  <p>
                    Affixes:{" "}
                    {i.affixes.map((a) => `${a.id} ${a.value}`).join(" · ") ||
                      "nenhum"}
                  </p>
                  {tab === "SELL" ? (
                    <p>Receber: {i.saleGold} GOLD</p>
                  ) : (
                    plan && (
                      <>
                        <p>
                          Resultado permitido: {rarityNames[plan.rarity]} ·
                          nível {i.level}, novos affixes.
                        </p>
                        {costs(plan.materials)}
                      </>
                    )
                  )}
                  {reason && <p>{reason}</p>}
                  <button
                    disabled={
                      busy ||
                      !!intent ||
                      !!reason ||
                      (tab !== "SELL" && (!plan || !affordable(plan.materials)))
                    }
                    onClick={() =>
                      begin({
                        operation,
                        instanceId: i.id,
                        ...(operation === "SELL_TO_VENDOR"
                          ? { vendorId: "refuge:trader" }
                          : {}),
                      })
                    }
                  >
                    {tab === "SELL"
                      ? "Vender"
                      : tab === "UPGRADE"
                        ? "Aprimorar"
                        : "Reforjar"}{" "}
                    {i.name}
                  </button>
                </article>
              );
            })}
          {tab === "HISTORY" &&
            history?.records.map((r) => (
              <article key={r.requestId}>
                <h3>{operationNames[r.operation]} · Confirmado</h3>
                <time dateTime={r.at}>
                  {new Date(r.at).toLocaleString("pt-BR")}
                </time>
                <p>Pedido {r.requestId}</p>
                {r.item && (
                  <p>
                    {itemName(r.item.itemId)} · {rarityNames[r.item.rarity]}
                  </p>
                )}
                {r.before && <p>Item anterior: {itemName(r.before.itemId)}</p>}
                <p>
                  Custo: {r.costs.gold} GOLD{" "}
                  {r.costs.materials
                    .map((m) => ` · ${m.amount} ${materialName(m.materialId)}`)
                    .join("")}
                </p>
                <p>
                  Recebido: {r.gains.gold} GOLD{" "}
                  {r.gains.materials
                    .map((m) => ` · ${m.amount} ${materialName(m.materialId)}`)
                    .join("")}
                </p>
              </article>
            ))}
          {tab === "HISTORY" && history?.records.length === 0 && (
            <p>Nenhuma operação confirmada nesta conta.</p>
          )}
          {tab === "HISTORY" && history?.next && (
            <button
              disabled={busy}
              onClick={() => void loadHistory(history.next!)}
            >
              Operações anteriores
            </button>
          )}
        </div>
      )}
    </section>
  );
}
