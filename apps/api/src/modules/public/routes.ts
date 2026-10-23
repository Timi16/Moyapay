import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { RefParamsSchema, VerifyBody } from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { watcherStatus } from "../../engine/status";
import { AppError } from "../../lib/errors";
import { parse } from "../../middleware/validate";
import type { SseRegistry } from "../stream/sse";
import type { PublicService } from "./service";

const STREAM_MAX_MS = 30 * 60_000;
const OpenedQuery = z.object({ opened: z.enum(["0", "1"]).optional() }).strict();

/** No auth: used by the payer's checkout. Only the fields a payer needs ever leave here. */
export function publicRoutes(
  deps: AppDeps,
  service: PublicService,
  sse: SseRegistry,
  opts: { verifyLimiter: RequestHandler },
): Router {
  const router = Router();

  router.get("/pay/:ref", async (req, res) => {
    const { ref } = parse(RefParamsSchema, req.params);
    const { opened } = parse(OpenedQuery, req.query);
    res.set("Cache-Control", "no-store");
    res.json(await service.get(ref, opened === "1"));
  });

  router.post("/pay/:ref/verify", opts.verifyLimiter, async (req, res) => {
    const { ref } = parse(RefParamsSchema, req.params);
    const { txHash } = parse(VerifyBody, req.body);
    res.json(await service.verify(ref, txHash));
  });

  /** Server-sent events: `status` with the full checkout whenever the request changes. */
  router.get("/pay/:ref/stream", async (req, res) => {
    const { ref } = parse(RefParamsSchema, req.params);
    const key = `ip:${req.ip ?? "unknown"}`;
    if (sse.count(key) >= deps.limits.sseStreamsPerIp) {
      throw new AppError("RATE_LIMITED", "Too many open streams", { retryAfter: 10 });
    }
    if (sse.total >= deps.limits.sseStreamsTotal) {
      throw new AppError("SERVICE_UNAVAILABLE", "Live updates are at capacity", { retryAfter: 30 });
    }
    const first = await service.get(ref, false);
    const stream = sse.open(req, res, key, STREAM_MAX_MS);
    const unsubscribe = deps.hub.subscribePublic(ref, (checkout) => stream.send("status", checkout));
    res.on("close", unsubscribe);
    stream.send("status", first);
  });

  router.get("/status", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(await watcherStatus(deps.prisma));
  });

  return router;
}
