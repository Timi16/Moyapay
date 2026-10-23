import { Router, type RequestHandler } from "express";
import { ChallengeBody, UpdateMerchantBody, VerifyChallengeBody } from "@moyapay/shared";
import { authOf, SESSION_COOKIE, sessionCookieOptions } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import { serializeMerchant, type AuthService } from "./service";

export function authRoutes(
  service: AuthService,
  opts: { limiter: RequestHandler; requireSession: RequestHandler },
): Router {
  const router = Router();

  router.post("/challenge", opts.limiter, async (req, res) => {
    const { address } = parse(ChallengeBody, req.body);
    res.status(201).json(await service.challenge(address));
  });

  router.post("/verify", opts.limiter, async (req, res) => {
    const body = parse(VerifyChallengeBody, req.body);
    const { merchant, token, created } = await service.verify(body, { ip: req.ip, userAgent: req.get("user-agent") });
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
    res.status(created ? 201 : 200).json({ merchant: serializeMerchant(merchant), created });
  });

  router.post("/logout", opts.requireSession, async (req, res) => {
    await service.logout(authOf(req).sessionId);
    const { maxAge: _maxAge, ...clear } = sessionCookieOptions();
    res.clearCookie(SESSION_COOKIE, clear);
    res.status(204).end();
  });

  router.get("/me", opts.requireSession, async (req, res) => {
    res.json({ merchant: serializeMerchant(await service.me(authOf(req).merchantId)) });
  });

  router.patch("/me", opts.requireSession, async (req, res) => {
    const body = parse(UpdateMerchantBody, req.body);
    res.json({ merchant: serializeMerchant(await service.updateMerchant(authOf(req).merchantId, body)) });
  });

  return router;
}
