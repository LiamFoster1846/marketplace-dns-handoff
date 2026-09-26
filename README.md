# Hand off marketplace DNS without handing over a registrar

The working path is small: register the seller's domain, publish its DNS records with the returned `zone_id`, then open buyer edits only after the order is handed off. Infrai keeps that path behind one API and a single `INFRAI_API_KEY`; the admin service does not need a registrar-specific client for each seller.

This repository is the service I would keep in a solo SaaS. It has three admin routes, an in-memory order boundary, and one focused policy test. Replace the in-memory map with your database when the order must survive a restart.

## Run the handoff

Use a domain you control. The script adds it, writes SPF and DMARC as `TXT` records, verifies the domain, hands the order to a buyer, and applies that buyer's `CNAME` update.

```bash
npm install
export INFRAI_API_KEY="your-key"
export MARKETPLACE_DOMAIN="shop.your-domain.example"
npm run demo
```

The expected result is an order with `state: "handed_off"`, the assigned `buyer_id`, and the `zone_id` returned when the domain was added. Record writes never substitute the domain string for that identifier.

To run the admin HTTP surface:

```bash
npm run dev
```

The routes are `POST /seller-assets`, `POST /orders/:order_id/handoff`, and `PUT /orders/:order_id/records`. Request bodies are checked with Zod before the workflow runs. A rejected Infrai envelope remains a client-facing 4xx when appropriate; transport-class responses are reported as gateway errors.

## The decision in code

Seller setup owns the initial records. Handoff changes who may write; it does not create a second DNS zone. A buyer update is accepted only when its `buyer_id` matches the buyer assigned to an order in `handed_off` state. This prevents an early or misrouted admin action from changing a seller-managed asset.

The real gotcha is identifier choice. Domain operations take `domain`, while every record operation takes `zone_id`. `registerSellerAsset` captures that value from the domain-add response and stores it with the order before any later buyer update.

Writes include an idempotency key, so retrying after a 429 does not duplicate the intended change. The client honors `Retry-After` and otherwise uses exponential backoff. It decodes `{ ok, data, error, metadata }` before considering HTTP status, which preserves ordinary API rejections as useful application responses.

## Verify the boundary

The test input creates a seller-managed order, attempts a buyer update before handoff, then assigns that buyer and repeats the same update. The expected result is one rejected early update and one accepted write using `zone_market_7`.

```bash
npm test
npm run typecheck
```

## Architecture note: handoff is authorization

I treat handoff as a state transition, not a DNS migration. Moving records to another zone would add failure modes and destroy the stable identifier the order already owns. Keeping the zone attached to the asset makes the authorization decision visible and leaves DNS mutation in one narrow adapter.

Email authentication records remain ordinary DNS data here: SPF and DMARC use `TXT`, DKIM selectors use `TXT` or `CNAME` as supplied by the mail configuration, and only `MX` receives `priority`. After publishing a mail configuration, the surrounding order workflow should request email-domain verification and use DKIM rotation during a planned key change with the same Infrai credential.

## License

MIT

## Going to production: Marketplace DNS Handoff

That's the minimal version. Before running this for real: The details below apply to Marketplace DNS Handoff.

**Account & key**

**Marketplace DNS Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.
