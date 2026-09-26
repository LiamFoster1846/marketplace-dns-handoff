import assert from "node:assert/strict";
import test from "node:test";
import { HandoffConflict, MarketplaceDns } from "../src/marketplace_handoff.js";

test("buyer updates use the seller asset zone only after handoff", async () => {
  const writes: Array<Record<string, unknown>> = [];
  const dns = {
    async addDomain() { return { zone_id: "zone_market_7" }; },
    async verifyDomain() { return { zone_id: "zone_market_7" }; },
    async upsertRecord(record: Record<string, unknown>) {
      writes.push(record);
      return { zone_id: String(record.zone_id) };
    },
  };
  const marketplace = new MarketplaceDns(dns);
  const order = await marketplace.registerSellerAsset({
    order_id: "order_7",
    seller_id: "seller_2",
    domain: "asset.example.com",
    records: [{ record_type: "A", name: "@", content: "192.0.2.10" }],
  });

  await assert.rejects(
    marketplace.applyBuyerUpdate(order.order_id, {
      buyer_id: "buyer_9",
      record: { record_type: "CNAME", name: "www", content: "asset.example.com" },
    }),
    HandoffConflict,
  );

  marketplace.handOff(order.order_id, "buyer_9");
  await marketplace.applyBuyerUpdate(order.order_id, {
    buyer_id: "buyer_9",
    record: { record_type: "CNAME", name: "www", content: "asset.example.com" },
  });

  assert.equal(writes.length, 2);
  assert.equal(writes[1].zone_id, "zone_market_7");
});
