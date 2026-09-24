"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { accountAction } from "../../server/actions";
import { ACHIEVEMENTS, CHARACTER_DEFINITIONS } from "../../game/content/catalog";
import { achievementAmount, achievementCurrency } from "../../game/core/economy";
import type { SaveData } from "../../game/core/types";
export default function ProfileSettings({ progress, importPending }: {progress:SaveData;importPending:boolean}) {
 const router=useRouter();
 const [local,setLocal]=useState<unknown>(null), [error,setError]=useState("");
 useEffect(()=>{queueMicrotask(()=>{try{setLocal(JSON.parse(localStorage.getItem("limiar.save.v1")||"null"));}catch{}})},[]);
 async function action(input:unknown){ const r=await accountAction(input); if(!r.ok)setError(r.error);else router.refresh(); }
 return <><p role="status">{error}</p>
            {importPending && local !== null && (
              <section className="card">
                <h2>Encontramos progresso local.</h2>
                <p>
                  Preserve uma cópia na conta e importe suas configurações. Gemas, Ouro
                  e conquistas locais permanecem no arquivo solo; recompensas de
                  equipe são conquistadas nas expedições online.
                </p>
                <div className="actions">
                  <button
                    onClick={() => void action({ type: "import", save: local })}
                  >
                    IMPORTAR PARA MINHA CONTA
                  </button>
                  <button onClick={() => void action({ type: "use-account" })}>
                    USAR PROGRESSO DA CONTA
                  </button>
                </div>
              </section>
            )}
                <details id="settings" open>
                  <summary>Configurações da conta</summary>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.sounds}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            sounds: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Áudio
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.numbers}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            numbers: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Números de dano
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={progress.settings.shake}
                      onChange={(e) =>
                        void action({
                          type: "settings",
                          settings: {
                            ...progress.settings,
                            shake: e.target.checked,
                          },
                        })
                      }
                    />{" "}
                    Tremor de tela
                  </label>
                </details>
                <details id="achievements" open>
                  <summary>Conquistas e descobertas online</summary>
                  <p>
                    {progress.runs} expedições · {progress.completed} concluídas
                    · Recorde {Math.floor(progress.bestTime / 60)} min
                  </p>
                  {ACHIEVEMENTS.map((a) => (
                    <p key={a.id}>
                      {progress.achievements.includes(a.id) ? "✓" : "◇"}{" "}
                      {a.name} — {a.text}
                      <br />Recompensa: {a.character ? `desbloqueia ${CHARACTER_DEFINITIONS[a.character].name}` : `${achievementCurrency(a.id) === "GOLD" ? "◈" : "◆"} ${achievementAmount(a.id, a.reward)} ${achievementCurrency(a.id) === "GOLD" ? "Ouro" : "Gemas"}`}
                    </p>
                  ))}
                  <p>
                    Descobertas:{" "}
                    {Object.entries(progress.discovered)
                      .map(([category, ids]) => `${category}: ${ids.length}`)
                      .join(" · ")}
                  </p>
                </details>
                {progress.legacyGoldConverted !== undefined && <p>Economia atualizada: {progress.legacyGoldConverted} Ouro antigo → {progress.legacyGoldConverted} Gemas. Suas melhorias foram preservadas.</p>}
</>;
}
