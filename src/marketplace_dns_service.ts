import { createServer, type ServerResponse } from "node:http";
import { ZodError, z } from "zod";
import { InfraiDnsClient, InfraiError } from "./infrai_dns.js";
import { HandoffConflict, MarketplaceDns } from "./marketplace_handoff.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const marketplace = new MarketplaceDns(new InfraiDnsClient(apiKey));
const handoffSchema = z.object({ buyer_id: z.string().min(1) });

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown : {};

    if (request.method === "POST" && url.pathname === "/seller-assets") {
      return send(response, 201, await marketplace.registerSellerAsset(body));
    }

    const handoff = url.pathname.match(/^\/orders\/([^/]+)\/handoff$/);
    if (request.method === "POST" && handoff) {
      const { buyer_id } = handoffSchema.parse(body);
      return send(response, 200, marketplace.handOff(decodeURIComponent(handoff[1]), buyer_id));
    }

    const update = url.pathname.match(/^\/orders\/([^/]+)\/records$/);
    if (request.method === "PUT" && update) {
      return send(response, 200, await marketplace.applyBuyerUpdate(decodeURIComponent(update[1]), body));
    }

    return send(response, 404, { error: "Route not found" });
  } catch (error) {
    if (error instanceof ZodError) return send(response, 400, { error: error.flatten() });
    if (error instanceof HandoffConflict) return send(response, 409, { error: error.message });
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      return send(response, status, { error: error.details });
    }
    return send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Marketplace DNS service listening on http://localhost:${port}`));
