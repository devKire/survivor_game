"use client";
import { createContext, useContext } from "react";
import type { RpgActionState } from "../../../server/rpg/actions";
import type { WorldOperation } from "../../../game/network/world";
export interface WorldTransport {
  form: (operation: WorldOperation, form: FormData) => Promise<RpgActionState>;
  rpc: (operation: WorldOperation, args: unknown) => Promise<unknown>;
  refresh: () => void;
}
export const WorldActionContext = createContext<WorldTransport | null>(null);
export const useWorldTransport = () => useContext(WorldActionContext);
