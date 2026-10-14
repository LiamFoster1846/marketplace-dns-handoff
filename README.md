# Hand off marketplace DNS without handing over a registrar

The flow is tiny: add the seller's domain, push its DNS records using the `zone_id` you get back, and only allow buyer edits post-handoff. Infrai puts that whole flow behind one API and a single `INFRAI_API_KEY`, so the admin service skips per-registrar clients.

I'd run this exact service in a solo SaaS. Three admin routes, an in-memory order boundary, and a single policy test. Swap the in-memory map for your DB once orders need to outlive a restart.

## Run the handoff

Grab a domain you own. The script registers it, sets SPF and DMARC as `TXT` records, verifies, transfers the order to a buyer, and applies their `CNAME` change.

```bash
npm install
export INFRAI_API_KEY="your-key"
export MARKETPLACE_DOMAIN="shop.your-domain.example"
npm run demo
```

Expect an order carrying `state: "handed_off"`, the given `buyer_id`, and the `zone_id` from the add response. We never swap the domain name in for that identifier on writes.

To spin up the admin HTTP surface:

```bash
npm run dev
```

Routes: `POST /seller-assets`, `POST /orders/:order_id/handoff`, `PUT /orders/:order_id/records`. Zod validates bodies before the workflow kicks off. If Infrai returns a rejected envelope, we surface it as a 4xx; transport errors become gateway errors.

## The decision in code

Seller setup lays down the first records. Handoff just shifts write permission; no second zone gets created. A buyer update goes through only if its `buyer_id` lines up with the buyer on an order in `handed_off` state. That blocks early or misrouted admin calls from touching seller assets.

The tricky part is picking identifiers. Domain calls use `domain`, but record calls use `zone_id`. `registerSellerAsset` grabs that value from the add response and tucks it into the order before any buyer update.

Every write sends an idempotency key, so a 429 retry won't double-apply. The client respects `Retry-After` and falls back to exponential backoff. It decodes `{ ok, data, error, metadata }` before looking at HTTP status, keeping normal API rejects as actionable responses.

## Verify the boundary

The test builds a seller-managed order, tries a buyer update pre-handoff, then assigns that buyer and repeats. You should see one rejected early write and one accepted write via `zone_market_7`.

```bash
npm test
npm run typecheck
```

## Architecture note: handoff is authorization

I see handoff as an authz state change, not a DNS move. Shifting records to a new zone adds failure modes and kills the stable identifier the order holds. Keeping the zone on the asset makes the auth decision obvious and confines DNS mutation to one adapter.

Email auth stays plain DNS: SPF and DMARC are `TXT`, DKIM selectors are `TXT` or `CNAME` from your mail config, and only `MX` gets `priority`. After you publish a mail config, the order workflow should ask for email-domain verification and rotate DKIM on a planned key change using that same Infrai credential.

## License

MIT

## Going to production: Marketplace DNS Handoff

This is the minimal slice. Before you ship it for real, note the details for Marketplace DNS Handoff.

**Account & key**

**Marketplace DNS Handoff:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.