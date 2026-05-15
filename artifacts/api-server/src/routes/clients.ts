import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient } from "../lib/auth";

const router: IRouter = Router();

router.get("/clients/me", requireAuth, loadOrCreateClient, async (req, res): Promise<void> => {
  if (!req.dbClient) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const org = req.organization!;
  const member = req.organizationMember;
  res.json(
    GetMeResponse.parse({
      ...req.dbClient,
      organization: {
        id: org.id,
        name: org.name,
        planType: org.planType,
        website: org.website ?? null,
        industry: org.industry ?? null,
        clientType: org.clientType ?? null,
      },
      member: member
        ? {
            id: member.id,
            email: member.email,
            role: member.role,
            isAdmin: member.role === "owner" || member.role === "admin",
            status: member.status,
            onboardingStep: member.onboardingStep ?? 0,
            onboardingCompletedAt: member.onboardingCompletedAt,
            onboardingState: member.onboardingState ?? null,
          }
        : null,
    }),
  );
});

export default router;
