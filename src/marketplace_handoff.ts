import { z } from "zod";
import type { DnsRecordInput, InfraiDnsClient } from "./infrai_dns.js";

const recordSchema = z.object({
  record_type: z.enum(["TXT", "CNAME", "MX", "A"]),
  name: z.string().min(1),
  content: z.string().min(1),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().nonnegative().optional(),
  proxied: z.boolean().optional(),
  record_id: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).optional(),
}).superRefine((record, context) => {
  if (record.priority !== undefined && record.record_type !== "MX") {
    context.addIssue({ code: "custom", message: "priority belongs only on MX records" });
  }
});

export const sellerAssetSchema = z.object({
  order_id: z.string().min(1),
  seller_id: z.string().min(1),
  domain: z.string().min(3),
  records: z.array(recordSchema).min(1),
});

export const buyerUpdateSchema = z.object({
  buyer_id: z.string().min(1),
  record: recordSchema,
});

type SellerAsset = z.infer<typeof sellerAssetSchema>;
type BuyerUpdate = z.infer<typeof buyerUpdateSchema>;

export type MarketplaceOrder = {
  order_id: string;
  seller_id: string;
  buyer_id?: string;
  domain: string;
  zone_id: string;
  state: "seller_managed" | "handed_off";
};

export class HandoffConflict extends Error {}

export class MarketplaceDns {
  private readonly orders = new Map<string, MarketplaceOrder>();
  private readonly dns: Pick<InfraiDnsClient, "addDomain" | "verifyDomain" | "upsertRecord">;

  constructor(dns: Pick<InfraiDnsClient, "addDomain" | "verifyDomain" | "upsertRecord">) {
    this.dns = dns;
  }

  async registerSellerAsset(raw: unknown): Promise<MarketplaceOrder> {
    const input: SellerAsset = sellerAssetSchema.parse(raw);
    const domain = await this.dns.addDomain(input.domain, {
      order_id: input.order_id,
      seller_id: input.seller_id,
    });
    for (const record of input.records) {
      await this.dns.upsertRecord({ ...record, zone_id: domain.zone_id });
    }
    await this.dns.verifyDomain(input.domain);

    const order: MarketplaceOrder = {
      order_id: input.order_id,
      seller_id: input.seller_id,
      domain: input.domain,
      zone_id: domain.zone_id,
      state: "seller_managed",
    };
    this.orders.set(order.order_id, order);
    return order;
  }

  handOff(orderId: string, buyerId: string): MarketplaceOrder {
    const order = this.requireOrder(orderId);
    const handedOff = { ...order, buyer_id: buyerId, state: "handed_off" as const };
    this.orders.set(orderId, handedOff);
    return handedOff;
  }

  async applyBuyerUpdate(orderId: string, raw: unknown): Promise<MarketplaceOrder> {
    const input: BuyerUpdate = buyerUpdateSchema.parse(raw);
    const order = this.requireOrder(orderId);
    if (order.state !== "handed_off" || order.buyer_id !== input.buyer_id) {
      throw new HandoffConflict("Only the assigned buyer can update DNS after handoff");
    }
    const record: DnsRecordInput = { ...input.record, zone_id: order.zone_id };
    await this.dns.upsertRecord(record);
    return order;
  }

  private requireOrder(orderId: string): MarketplaceOrder {
    const order = this.orders.get(orderId);
    if (!order) throw new HandoffConflict("Order does not exist");
    return order;
  }
}
