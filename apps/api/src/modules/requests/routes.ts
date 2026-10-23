import { Router } from "express";
import { CreatePaymentRequestBody, ListRequestsQuery, RefParamsSchema, VerifyBody } from "@moyapay/shared";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import { serializeRequest } from "./serialize";
import type { RequestService } from "./service";

export function requestRoutes(service: RequestService): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const auth = authOf(req);
    const body = parse(CreatePaymentRequestBody, req.body);
    const created = await service.create(auth.merchantId, body, auth.via === "apiKey" ? "api" : "dashboard");
    res.status(201).json(serializeRequest(created));
  });

  router.get("/", async (req, res) => {
    const { format, ...query } = parse(ListRequestsQuery, req.query);
    const { merchantId } = authOf(req);
    if (format === "csv") {
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="moyapay-requests-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(await service.csv(merchantId, query));
      return;
    }
    res.json(await service.list(merchantId, query));
  });

  router.get("/:ref", async (req, res) => {
    const { ref } = parse(RefParamsSchema, req.params);
    res.json(await service.get(authOf(req).merchantId, ref));
  });

  router.post("/:ref/verify", async (req, res) => {
    const { ref } = parse(RefParamsSchema, req.params);
    const { txHash } = parse(VerifyBody, req.body);
    res.json(await service.verify(authOf(req).merchantId, ref, txHash));
  });

  return router;
}
