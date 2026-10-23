import type { Merchant, WebhookDelivery } from "@prisma/client";
import { Router } from "express";
import {
  UpdateWebhookBody,
  WEBHOOK_EVENTS,
  type WebhookDelivery as DeliveryDto,
  type WebhookEvent,
  type WebhookSettings,
} from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { AppError } from "../../lib/errors";
import { webhookSecret } from "../../lib/ids";
import { assertUrlAllowed, UrlPolicyError } from "../../lib/safeHttp";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import { enqueueWebhook } from "./outbox";

function settings(m: Merchant): WebhookSettings {
  return {
    url: m.webhookUrl,
    events: m.webhookEvents.filter((e): e is WebhookEvent => (WEBHOOK_EVENTS as readonly string[]).includes(e)),
    secret: webhookSecret(m.id, m.webhookSecretVersion),
  };
}

function serializeDelivery(d: WebhookDelivery): DeliveryDto {
  return {
    id: d.id,
    event: d.event as DeliveryDto["event"],
    status: d.status,
    attempts: d.attempts,
    lastStatusCode: d.lastStatusCode,
    lastError: d.lastError,
    nextAttemptAt: d.status === "PENDING" ? d.nextAttemptAt.toISOString() : null,
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Status webhook settings (session only: they include the signing secret). */
export function webhookRoutes(deps: AppDeps): Router {
  const router = Router();
  const { prisma } = deps;
  const merchantOf = (id: string) => prisma.merchant.findUniqueOrThrow({ where: { id } });

  router.get("/", async (req, res) => {
    res.json(settings(await merchantOf(authOf(req).merchantId)));
  });

  router.put("/", async (req, res) => {
    const { merchantId } = authOf(req);
    const body = parse(UpdateWebhookBody, req.body);
    if (body.url !== null) {
      try {
        await assertUrlAllowed(body.url, { allowInsecure: deps.allowInsecureWebhooks });
      } catch (err) {
        if (err instanceof UrlPolicyError) throw new AppError("WEBHOOK_URL_REJECTED", err.message);
        throw err;
      }
    }
    const m = await prisma.merchant.update({
      where: { id: merchantId },
      data: { webhookUrl: body.url, webhookEvents: [...new Set(body.events)] },
    });
    res.json(settings(m));
  });

  router.post("/roll-secret", async (req, res) => {
    const m = await prisma.merchant.update({
      where: { id: authOf(req).merchantId },
      data: { webhookSecretVersion: { increment: 1 } },
    });
    res.json(settings(m));
  });

  router.post("/test", async (req, res) => {
    const { merchantId } = authOf(req);
    const id = await enqueueWebhook(prisma, merchantId, "ping", { message: "Test webhook from MoyaPay" });
    if (!id) throw new AppError("VALIDATION_FAILED", "Set a webhook URL first");
    res.status(202).json({ id });
  });

  router.get("/deliveries", async (req, res) => {
    const rows = await prisma.webhookDelivery.findMany({
      where: { merchantId: authOf(req).merchantId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ data: rows.map(serializeDelivery) });
  });

  return router;
}
