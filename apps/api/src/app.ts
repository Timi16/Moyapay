import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { DEFAULT_LIMITS, type AppDeps, type Limits } from "./deps";
import { authOf, requireAny, requireSession, sessionOnly } from "./middleware/auth";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { PgRateLimitStore } from "./middleware/pgRateLimitStore";
import { limiter } from "./middleware/rateLimit";
import { requestId } from "./middleware/requestId";
import { requireOrigin } from "./middleware/requireOrigin";
import { rejectNulBytes } from "./middleware/validate";
import { apiKeyRoutes } from "./modules/apiKeys/routes";
import { createApiKeyService } from "./modules/apiKeys/service";
import { authRoutes } from "./modules/auth/routes";
import { createAuthService } from "./modules/auth/service";
import { dashboardRoutes } from "./modules/dashboard/routes";
import { healthRoutes } from "./modules/health/routes";
import { publicRoutes } from "./modules/public/routes";
import { createPublicService } from "./modules/public/service";
import { requestRoutes } from "./modules/requests/routes";
import { createRequestService } from "./modules/requests/service";
import { merchantStreamRoutes } from "./modules/stream/routes";
import { SseRegistry } from "./modules/stream/sse";
import { transactionRoutes } from "./modules/transactions/routes";
import { createTransactionService } from "./modules/transactions/service";
import { webhookRoutes } from "./modules/webhooks/routes";

export interface BuiltApp {
  app: Express;
  sse: SseRegistry;
}

export type BuildAppDeps = Omit<AppDeps, "limits" | "allowInsecureWebhooks"> & {
  limits?: Partial<Limits>;
  allowInsecureWebhooks?: boolean;
};

export const API_PREFIX = "/api/v1";

/** Wires everything in a fixed order. Tests import this same function. */
export function buildApp(input: BuildAppDeps): BuiltApp {
  const deps: AppDeps = {
    ...input,
    allowInsecureWebhooks: input.allowInsecureWebhooks ?? false,
    limits: { ...DEFAULT_LIMITS, ...input.limits },
  };
  const { limits, prisma } = deps;
  const sse = new SseRegistry();
  const app = express();

  // 1. Behind Caddy (and maybe the web app's proxy): trust exactly that many hops so req.ip
  // is the real client.
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.set("query parser", "simple");

  // 2-3. Request id, then logging (secrets are redacted by the logger).
  app.use(requestId);
  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req as express.Request).requestId,
      autoLogging: { ignore: (req) => req.url === "/health" || (req.url ?? "").startsWith(`${API_PREFIX}/public/pay/`) },
      // Query strings are dropped from logs: they can carry cursors and search terms.
      serializers: {
        req: (req: { method: string; url: string; id: unknown }) => ({
          id: req.id,
          method: req.method,
          url: req.url.split("?")[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // 4. Security headers. The API serves JSON (and CSV) only, so nothing may frame or load from it.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // 5. Body parsing.
  app.use(express.json({ limit: "50kb" }));
  app.use(cookieParser());
  app.use(rejectNulBytes);

  // 6. Open routes: health, the payer's checkout and the watcher status. Any origin, no cookies.
  const openCors = cors({ origin: "*", methods: ["GET", "POST"], exposedHeaders: ["X-Request-Id", "Retry-After"] });
  app.use("/health", openCors, healthRoutes(deps));
  app.use(
    `${API_PREFIX}/public`,
    openCors,
    limiter({ limit: limits.publicPerMin }),
    publicRoutes(deps, createPublicService(deps), sse, { verifyLimiter: limiter({ limit: limits.publicVerifyPerMin }) }),
  );

  // 7. Everything else under /api/v1 is the merchant's: the dashboard (cookie) or an API key.
  app.use(
    API_PREFIX,
    cors({
      // Every listed origin may call the API with credentials.
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      exposedHeaders: ["X-Request-Id", "Retry-After", "Content-Disposition"],
      maxAge: 600,
    }),
  );

  app.use(
    `${API_PREFIX}/auth`,
    requireOrigin,
    authRoutes(createAuthService(deps), {
      // Shared across instances: this is the brute-force limit.
      limiter: limiter({ limit: limits.authPerMin, store: new PgRateLimitStore(prisma, "auth:") }),
      requireSession: requireSession(prisma),
    }),
  );

  const v1 = express.Router();
  v1.use(limiter({ limit: limits.v1PerIpPerMin }));
  v1.use(requireAny(prisma));
  v1.use(requireOrigin);
  v1.use(limiter({ limit: limits.v1PerMin, key: (req) => `merchant:${authOf(req).merchantId}` }));
  v1.use("/payment-requests", requestRoutes(createRequestService(deps)));
  v1.use("/transactions", transactionRoutes(createTransactionService(deps)));
  v1.use("/", dashboardRoutes(deps));
  v1.use("/api-keys", sessionOnly, apiKeyRoutes(createApiKeyService(deps)));
  v1.use("/webhook", sessionOnly, webhookRoutes(deps));
  v1.use("/stream", sessionOnly, merchantStreamRoutes(deps, sse));
  app.use(API_PREFIX, v1);

  // 8. 404, then the error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, sse };
}
