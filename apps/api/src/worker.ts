import { env } from "./config/env";
import { CHANNELS, PgListener } from "./db/notify";
import { isDbUnavailable, prisma } from "./db/prisma";
import { createAlerter } from "./engine/alerter";
import { EXPIRY_INTERVAL_MS, expireOverdue } from "./engine/expiry";
import { housekeeping } from "./engine/housekeeping";
import { WatcherHealth } from "./engine/status";
import { Watcher } from "./engine/watcher";
import { DELIVERY_INTERVAL_MS, deliverDue } from "./engine/webhookDelivery";
import { logger } from "./lib/logger";
import { createSafeHttpClient } from "./lib/safeHttp";
import { HorizonClient } from "./lib/stellar/horizon";

// worker process: the Horizon watcher, its heartbeat, the per-minute scheduler (expiry and
// watcher health), status webhook delivery and housekeeping. Run exactly one.

const HEARTBEAT_MS = 5000;
const REFRESH_MS = 2000;
const controller = new AbortController();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (controller.signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", done);
      resolve();
    }
    controller.signal.addEventListener("abort", done, { once: true });
  });
}

/** Runs `fn` forever, `everyMs` apart. Failures back off 1 s -> 30 s; the loop never dies. */
async function loop(name: string, everyMs: number, fn: () => Promise<unknown>): Promise<void> {
  let failures = 0;
  while (!controller.signal.aborted) {
    let delay = everyMs;
    try {
      await fn();
      failures = 0;
    } catch (err) {
      failures++;
      delay = Math.min(1000 * 2 ** (failures - 1), 30_000);
      const level = isDbUnavailable(err) || failures > 1 ? "warn" : "error";
      logger[level]({ err, loop: name, failures, retryInMs: delay }, "worker loop failed");
    }
    await sleep(delay);
  }
}

async function main(): Promise<void> {
  const alerter = createAlerter(logger, env.ALERT_TELEGRAM_BOT_TOKEN, env.ALERT_TELEGRAM_CHAT_ID);
  const horizon = new HorizonClient(env.HORIZON_URL);
  const watcher = new Watcher({ prisma, horizon, logger });
  const health = new WatcherHealth(prisma, alerter);
  const http = createSafeHttpClient({ allowInsecure: env.WEBHOOK_ALLOW_INSECURE });

  // A new destination (merchant sign-up, request to a new address) starts its stream at once.
  const listener = new PgListener({
    connectionString: env.DATABASE_URL,
    channels: [CHANNELS.destinationsChanged],
    onNotification: watcher.markDirty,
    onConnect: watcher.markDirty,
    logger,
  });
  await listener.start();

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker shutting down after the payment in progress");
    controller.abort();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info({ horizon: env.HORIZON_URL }, "worker started");
  await Promise.all([
    loop("watcher", REFRESH_MS, () => watcher.refresh(controller.signal)),
    loop("heartbeat", HEARTBEAT_MS, () => watcher.heartbeat()),
    loop("expiry", EXPIRY_INTERVAL_MS, () => expireOverdue(prisma)),
    loop("health", 60_000, () => health.check()),
    loop("webhooks", DELIVERY_INTERVAL_MS, () => deliverDue({ prisma, http, logger })),
    loop("housekeeping", 10 * 60_000, () => housekeeping(prisma)),
  ]);

  await watcher.stopped();
  await listener.stop();
  await http.close();
  await prisma.$disconnect();
  logger.info("worker stopped");
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "worker crashed");
  process.exit(1);
});
