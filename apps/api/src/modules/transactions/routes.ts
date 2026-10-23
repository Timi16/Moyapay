import { Router } from "express";
import { IdParamsSchema, ListTransactionsQuery, PatchTransactionBody } from "@moyapay/shared";
import { authOf } from "../../middleware/auth";
import { parse } from "../../middleware/validate";
import type { TransactionService } from "./service";

/** Reconciliation records: every incoming payment with its result and resolution. */
export function transactionRoutes(service: TransactionService): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { format, ...query } = parse(ListTransactionsQuery, req.query);
    const { merchantId } = authOf(req);
    if (format === "csv") {
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="moyapay-reconciliation-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(await service.csv(merchantId, query));
      return;
    }
    res.json(await service.list(merchantId, query));
  });

  router.get("/:id", async (req, res) => {
    const { id } = parse(IdParamsSchema, req.params);
    res.json(await service.get(authOf(req).merchantId, id));
  });

  router.patch("/:id", async (req, res) => {
    const { id } = parse(IdParamsSchema, req.params);
    const body = parse(PatchTransactionBody, req.body);
    res.json(await service.patch(authOf(req).merchantId, id, body));
  });

  return router;
}
