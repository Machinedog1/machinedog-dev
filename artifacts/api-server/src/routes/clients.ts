import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient } from "../lib/auth";

const router: IRouter = Router();

router.get("/clients/me", requireAuth, loadOrCreateClient, async (req, res): Promise<void> => {
  if (!req.client) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json(GetMeResponse.parse(req.client));
});

export default router;
