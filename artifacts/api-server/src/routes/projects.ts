import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import {
  ListMyProjectsResponse,
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";

const router: IRouter = Router();

router.get("/projects", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.clientId, req.client!.id))
    .orderBy(desc(projectsTable.updatedAt));
  res.json(ListMyProjectsResponse.parse({ data: rows }));
});

router.post("/projects", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(projectsTable)
    .values({
      clientId: req.client!.id,
      title: parsed.data.title,
      description: parsed.data.description,
      status: "draft",
    })
    .returning();
  res.status(201).json(GetProjectResponse.parse(row));
});

router.get("/projects/:id", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const params = GetProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.clientId, req.client!.id)));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(GetProjectResponse.parse(row));
});

router.patch("/projects/:id", requireAuth, loadOrCreateClient, requireActiveClient, async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateProjectBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(projectsTable)
    .set({
      ...(body.data.title !== undefined && { title: body.data.title }),
      ...(body.data.description !== undefined && { description: body.data.description }),
      ...(body.data.status !== undefined && { status: body.data.status }),
    })
    .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.clientId, req.client!.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(UpdateProjectResponse.parse(row));
});

export default router;
