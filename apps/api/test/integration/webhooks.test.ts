import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deliverDue, MAX_ATTEMPTS } from "../../src/engine/webhookDelivery";
import { webhookSecret } from "../../src/lib/ids";
import { verifySignature } from "../../src/lib/hmac";
import { createSafeHttpClient } from "../../src/lib/safeHttp";
import { enqueueWebhook } from "../../src/modules/webhooks/outbox";
import { createMerchant, prisma, resetDb, silentLogger } from "../helpers/harness";

interface Received {
  headers: IncomingMessage["headers"];
  body: string;
}

let server: Server;
let received: Received[];
let status = 200;
const http = createSafeHttpClient({ allowInsecure: true, timeoutMs: 2000 });

beforeEach(async () => {
  await resetDb();
  received = [];
  status = 200;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = status;
      res.end("ok");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
});

afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

async function merchantWithHook() {
  const m = await createMerchant();
  const port = (server.address() as AddressInfo).port;
  return prisma.merchant.update({
    where: { id: m.id },
    data: { webhookUrl: `http://127.0.0.1:${port}/hook`, webhookEvents: ["request.paid", "request.expired"] },
  });
}

describe("status webhook delivery", () => {
  it("POSTs the event signed with the merchant's secret", async () => {
    const m = await merchantWithHook();
    const id = await enqueueWebhook(prisma, m.id, "request.paid", { request: { reference: "MP-2222AB" } });
    expect(await deliverDue({ prisma, http, logger: silentLogger })).toBe(1);
    expect(received).toHaveLength(1);
    const [hit] = received;
    if (!hit) throw new Error("nothing received");
    expect(hit.headers["moyapay-id"]).toBe(id);
    const ok = verifySignature(
      webhookSecret(m.id, m.webhookSecretVersion),
      String(hit.headers["moyapay-signature"]),
      String(hit.headers["moyapay-timestamp"]),
      hit.body,
    );
    expect(ok).toBe(true);
    expect(JSON.parse(hit.body)).toMatchObject({ id, type: "request.paid", data: { request: { reference: "MP-2222AB" } } });
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: id ?? "" } });
    expect(row).toMatchObject({ status: "DELIVERED", attempts: 1, lastStatusCode: 200 });
  });

  it("retries a failed delivery later with the same id, and gives up after the last attempt", async () => {
    const m = await merchantWithHook();
    status = 500;
    const id = (await enqueueWebhook(prisma, m.id, "request.expired", {})) ?? "";
    await deliverDue({ prisma, http, logger: silentLogger });
    let row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastStatusCode: 500, lastError: "HTTP 500" });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 5000);
    // Not due yet: nothing is sent.
    expect(await deliverDue({ prisma, http, logger: silentLogger })).toBe(0);

    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      await prisma.webhookDelivery.update({ where: { id }, data: { nextAttemptAt: new Date(Date.now() - 1000) } });
      await deliverDue({ prisma, http, logger: silentLogger });
    }
    row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    expect(new Set(received.map((r) => r.headers["moyapay-id"]))).toEqual(new Set([id]));
  });

  it("is not queued without a URL", async () => {
    const m = await createMerchant();
    expect(await enqueueWebhook(prisma, m.id, "request.paid", {})).toBeNull();
  });
});
