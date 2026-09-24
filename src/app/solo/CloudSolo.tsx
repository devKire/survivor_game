"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserGame } from "../../game/client/browser";
import { GameShell } from "../../game/client/OfflineGame";
import type { SaveData } from "../../game/core/types";
import { saveSchema, migrateSave } from "../../game/core/save";
import { saveSolo } from "../../server/actions";
export default function CloudSolo({
  userId,
  initial,
  revision,
}: {
  userId: string;
  initial: SaveData;
  revision: number;
}) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null),
    game = useRef<BrowserGame | null>(null),
    [status, setStatus] = useState("Solo na conta · salvamento automático"),
    [cache, setCache] = useState<SaveData | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    let version = revision,
      dirty = false,
      busy = false,
      blocked = false,
      disposed = false,
      flushPending: Promise<void> | null = null;
    const key = "limiar.solo.cache." + userId;
    const g = new BrowserGame(canvas.current, initial);
    game.current = g;
    queueMicrotask(() => {
      try {
        const pending = saveSchema.safeParse(
          JSON.parse(localStorage.getItem(key) || "null"),
        );
        if (pending.success) setCache(migrateSave(pending.data));
      } catch {}
    });
    g.persist = () => {
      dirty = true;
      try {
        localStorage.setItem(key, JSON.stringify(g.save));
      } catch {}
      return true;
    };
    async function flush() {
      if (busy) {
        await flushPending;
        return;
      }
      if (!dirty || blocked) return;
      dirty = false;
      busy = true;
      flushPending = (async () => {
        const result = await saveSolo({ version, save: g.save }).catch(() => ({
          ok: false as const,
          error: "Sem conexão. Cache salvo neste navegador.",
        }));
        busy = false;
        if (result.ok) {
          version = result.version;
          if (!dirty) localStorage.removeItem(key);
          if (!disposed) setStatus("Solo salvo na conta");
        } else {
          blocked = true;
          if (!disposed) setStatus(result.error);
        }
      })();
      await flushPending;
    }
    g.onHub = () => {
      g.saveSnapshot(true);
      void (async () => {
        do {
          await flush();
        } while (dirty && !blocked);
        router.push("/");
      })();
    };
    const timer = setInterval(() => void flush(), 1500);
    return () => {
      g.dispose();
      disposed = true;
      clearInterval(timer);
      void flush();
    };
  }, [initial, revision, userId, router]);
  return (
    <>
      <GameShell canvasRef={canvas} />
      <aside className="solo-sync">
        <span role="status">{status}</span>
        {cache && (
          <section>
            <p>Existe uma cópia solo que ainda não foi sincronizada.</p>
            <button
              onClick={() => {
                if (game.current) {
                  game.current.save = cache;
                  game.current.persist();
                  game.current.ui.main();
                }
                setCache(null);
              }}
            >
              Usar cópia deste navegador
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("limiar.solo.cache." + userId);
                setCache(null);
              }}
            >
              Usar save da conta
            </button>
          </section>
        )}
      </aside>
    </>
  );
}
