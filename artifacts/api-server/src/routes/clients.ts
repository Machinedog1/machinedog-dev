import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { resolveOrganizationForClient } from "@workspace/db";
import { requireAuth, loadOrCreateClient } from "../lib/auth";

const router: IRouter = Router();

router.get("/clients/me", requireAuth, loadOrCreateClient, async (req, res): Promise<void> => {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const resolved = await resolveOrganizationForClient(req.dbClient.id);
  res.json(
    GetMeResponse.parse({
      ...req.dbClient,
      organization: resolved
        ? {
            id: resolved.organization.id,
            name: resolved.organization.name,
            planType: resolved.organization.planType,
          }
        : null,
    }),
  );
});

export default router;
