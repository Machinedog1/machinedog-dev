import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, templatesTable } from "@workspace/db";
import { ListTemplatesQueryParams, ListTemplatesResponse } from "@workspace/api-zod";
import { requireAuth, requireActiveClient } from "../lib/auth";

const router: IRouter = Router();

router.get(
  "/templates",
  requireAuth,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListTemplatesQueryParams.safeParse(req.query);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    // Strip the heavy `starterFiles` blob from the list response — the
    // wizard only needs metadata + compliance copy. Starter files are
    // copied server-side at create-project time, so the client never
    // needs to see them.
    const base = db
      .select({
        id: templatesTable.id,
        slug: templatesTable.slug,
        name: templatesTable.name,
        description: templatesTable.description,
        category: templatesTable.category,
        framework: templatesTable.framework,
        projectType: templatesTable.projectType,
        isHealthcare: templatesTable.isHealthcare,
        tokenCost: templatesTable.tokenCost,
        complianceNotes: templatesTable.complianceNotes,
        createdAt: templatesTable.createdAt,
      })
      .from(templatesTable);
    const rows = params.data.category
      ? await base.where(eq(templatesTable.category, params.data.category)).orderBy(asc(templatesTable.id))
      : await base.orderBy(asc(templatesTable.id));
    res.json(ListTemplatesResponse.parse({ data: rows }));
  },
);

export default router;
