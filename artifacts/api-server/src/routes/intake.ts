import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  intakeSubmissionsTable,
  TIMELINE_OPTIONS,
  BUDGET_OPTIONS,
} from "@workspace/db";

const router: IRouter = Router();

const CreateIntakeBody = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  projectDescription: z
    .string()
    .trim()
    .min(20, "Tell us a bit more — at least 20 characters")
    .max(4000),
  timeline: z.enum(TIMELINE_OPTIONS),
  budget: z.enum(BUDGET_OPTIONS),
  referralSource: z.string().trim().max(200).optional().or(z.literal("")),
  successCriteria: z
    .string()
    .trim()
    .min(10, "Help us understand what success looks like")
    .max(2000),
});

router.post("/intake", async (req, res): Promise<void> => {
  const parsed = CreateIntakeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid submission",
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  const data = parsed.data;
  const [row] = await db
    .insert(intakeSubmissionsTable)
    .values({
      name: data.name,
      email: data.email,
      company: data.company ? data.company : null,
      projectDescription: data.projectDescription,
      timeline: data.timeline,
      budget: data.budget,
      referralSource: data.referralSource ? data.referralSource : null,
      successCriteria: data.successCriteria,
    })
    .returning({ id: intakeSubmissionsTable.id });

  res.json({ ok: true, id: row?.id ?? null });
});

export default router;
