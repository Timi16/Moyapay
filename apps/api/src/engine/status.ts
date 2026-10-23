import type { PrismaClient } from "@prisma/client";
import type { WatcherStatus } from "@moyapay/shared";
import type { Db } from "../db/prisma";
import type { Alerter } from "./alerter";
import { HEARTBEAT_ID } from "./watcher";

/** The heartbeat is written every 5 s; older than this and the watcher is considered down. */
export const HEARTBEAT_STALE_MS = 60_000;
/** A destination's stream may be reconnecting; disconnected longer than this is an incident. */
const DISCONNECTED_ALERT_MS = 2 * 60_000;

export async function watcherStatus(db: Db, now = Date.now()): Promise<WatcherStatus> {
  const beat = await db.watcherHeartbeat.findUnique({ where: { id: HEARTBEAT_ID } });
  const fresh = beat !== null && now - beat.beatAt.getTime() < HEARTBEAT_STALE_MS;
  return {
    network: "testnet",
    healthy: fresh && beat.connectedStreams === beat.streams,
    latestLedger: beat?.latestLedger ?? null,
    latestLedgerAt: beat?.latestLedgerAt?.toISOString() ?? null,
    lastBeatAt: beat?.beatAt.toISOString() ?? null,
    streams: { total: beat?.streams ?? 0, connected: fresh ? (beat?.connectedStreams ?? 0) : 0 },
  };
}

/**
 * The scheduler's health check (every minute): alerts once when the heartbeat goes stale or a
 * destination's stream stays disconnected, and once more when it recovers.
 */
export class WatcherHealth {
  private alerted = new Set<string>();
  private readonly startedAt: number;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly alerter: Alerter,
    now = Date.now(),
  ) {
    this.startedAt = now;
  }

  async check(now = Date.now()): Promise<{ healthy: boolean; problems: string[] }> {
    const problems: string[] = [];
    const beat = await this.prisma.watcherHeartbeat.findUnique({ where: { id: HEARTBEAT_ID } });
    // Right after the worker starts, the first heartbeat may not be written yet.
    const settling = now - this.startedAt < HEARTBEAT_STALE_MS;
    if (!settling && (!beat || now - beat.beatAt.getTime() >= HEARTBEAT_STALE_MS)) {
      problems.push("heartbeat");
    }
    const stuck = await this.prisma.watcherCursor.findMany({
      where: { connected: false, updatedAt: { lt: new Date(now - DISCONNECTED_ALERT_MS) } },
      select: { destination: true, lastError: true },
      take: 20,
    });
    for (const s of stuck) problems.push(`stream:${s.destination}`);

    for (const p of problems) {
      if (this.alerted.has(p)) continue;
      this.alerted.add(p);
      await this.alerter.alert(
        p === "heartbeat"
          ? "Watcher heartbeat is stale: no payments are being detected."
          : `Horizon stream for ${p.slice(7)} has been disconnected for over 2 minutes.`,
      );
    }
    for (const p of [...this.alerted]) {
      if (problems.includes(p)) continue;
      this.alerted.delete(p);
      await this.alerter.alert(p === "heartbeat" ? "Watcher heartbeat recovered." : `Horizon stream for ${p.slice(7)} reconnected.`);
    }
    return { healthy: problems.length === 0, problems };
  }
}
