"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function HudSlot({
  icon,
  label,
  detail,
}: {
  icon: string;
  label: string;
  detail?: string;
}) {
  return (
    <span
      className="hud-slot"
      tabIndex={0}
      aria-label={[label, detail].filter(Boolean).join(" · ")}
      title={[label, detail].filter(Boolean).join(" · ")}
    >
      <b aria-hidden="true">{icon}</b>
      {detail && <small>{detail.split(" · ")[0]}</small>}
      <span className="hud-slot-tooltip">
        {label}
        {detail && ` · ${detail}`}
      </span>
    </span>
  );
}

export function GameDrawer({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="game-drawer"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Fechar painel" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
