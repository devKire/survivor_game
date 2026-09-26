import { COSMETICS } from "./cosmetics";

export interface StoreOffer {
  id: string;
  type: "COSMETIC" | "BUNDLE" | "CURRENCY";
  productIds: string[];
  title: string;
  description: string;
  featured: boolean;
  internalPrice?: { currency: "GOLD" | "GEMS"; amount: number };
  externalPrice?: { currency: "BRL"; minorUnits: number };
  providerProductKey?: string;
  enabled: boolean;
}

/** Merchandising only. Existing purchases continue through the authoritative catalog. */
export const STORE_OFFERS: StoreOffer[] = Object.values(COSMETICS).map((c) => ({
  id: `cosmetic:${c.id}`,
  type: "COSMETIC",
  productIds: [c.id],
  title: c.name,
  description: `${c.rarity} · Aparência cosmética`,
  featured: c.type === "CHARACTER_SKIN" && c.rarity === "LENDÁRIO",
  internalPrice: { currency: "GOLD", amount: c.gold },
  enabled: true,
}));
