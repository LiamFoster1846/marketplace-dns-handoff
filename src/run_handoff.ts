import { InfraiDnsClient } from "./infrai_dns.js";
import { MarketplaceDns } from "./marketplace_handoff.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the handoff");

const marketplace = new MarketplaceDns(new InfraiDnsClient(apiKey));
const order = await marketplace.registerSellerAsset({
  order_id: "order_1042",
  seller_id: "seller_28",
  domain: process.env.MARKETPLACE_DOMAIN ?? "shop.example.com",
  records: [
    { record_type: "TXT", name: "@", content: "v=spf1 include:mail.example.net ~all", ttl: 3600 },
    { record_type: "TXT", name: "_dmarc", content: "v=DMARC1; p=quarantine", ttl: 3600 },
  ],
});

marketplace.handOff(order.order_id, "buyer_73");
const result = await marketplace.applyBuyerUpdate(order.order_id, {
  buyer_id: "buyer_73",
  record: { record_type: "CNAME", name: "store", content: "shops.example.net", ttl: 300 },
});

console.log(JSON.stringify(result, null, 2));
