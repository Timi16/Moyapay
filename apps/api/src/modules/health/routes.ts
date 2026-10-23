import { Router } from "express";
import { OPEN_STATUSES, type Health } from "@moyapay/shared";
import type { AppDeps } from "../../deps";
import { watcherStatus } from "../../engine/status";

/** DB status, watcher status and the open request count. 503 when the DB is down. */
export function healthRoutes(deps: AppDeps): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const [watcher, openRequests] = await Promise.all([
        watcherStatus(deps.prisma),
        deps.prisma.paymentRequest.count({ where: { status: { in: [...OPEN_STATUSES] } } }),
      ]);
      const body: Health = { status: "ok", db: "up", network: "testnet", watcher, openRequests };
      res.json(body);
    } catch (err) {
      deps.logger.error({ err }, "health check failed");
      const body: Health = { status: "degraded", db: "down", network: "testnet", watcher: null, openRequests: null };
      res.status(503).json(body);
    }
  });
  return router;
}
