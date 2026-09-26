import "server-only";

export type PaymentStatus = "NOT_CONFIGURED" | "PENDING" | "PAID" | "FAILED";
export interface PaymentProvider {
  createCheckout(input: {
    userId: string;
    offerId: string;
    idempotencyKey: string;
  }): Promise<{ status: PaymentStatus; checkoutUrl?: string }>;
  getStatus(checkoutId: string): Promise<PaymentStatus>;
  handleWebhook(
    rawBody: Uint8Array,
    signature: string,
  ): Promise<{ verified: boolean; eventId?: string }>;
}

/** No checkout or grant route exists until a provider verifies signed webhooks.
 * Future fulfillment must claim eventId in the transaction ledger before granting.
 * Neither client declarations nor a checkout redirect can authorize a grant.
 */
export const paymentProvider: PaymentProvider = {
  async createCheckout() {
    return { status: "NOT_CONFIGURED" };
  },
  async getStatus() {
    return "NOT_CONFIGURED";
  },
  async handleWebhook() {
    return { verified: false };
  },
};
