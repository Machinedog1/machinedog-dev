import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, or, ne, isNotNull } from "drizzle-orm";
import {
  db,
  projectsTable,
  projectMembersTable,
  clientsTable,
  type Project,
} from "@workspace/db";
import {
  ListMyProjectsResponse,
  CreateProjectBody,
  GetProjectParams,
  GetProjectResponse,
  UpdateProjectParams,
  UpdateProjectBody,
  UpdateProjectResponse,
  ListProjectMembersParams,
  ListProjectMembersResponse,
  InviteProjectMemberParams,
  InviteProjectMemberBody,
  RemoveProjectMemberParams,
} from "@workspace/api-zod";
import { requireAuth, loadOrCreateClient, requireActiveClient } from "../lib/auth";
import { sendProjectInviteEmail } from "../lib/project-invites";
import { logger } from "../lib/logger";

const router: IRouter = Router();

type ProjectWithRole = Project & { viewerRole: "owner" | "collaborator" };

function withOwnerRole(row: Project): ProjectWithRole {
  return { ...row, viewerRole: "owner" };
}

function withCollaboratorRole(row: Project): ProjectWithRole {
  return { ...row, viewerRole: "collaborator" };
}

async function getViewableProject(
  projectId: number,
  clientId: number,
  clientEmail: string,
): Promise<ProjectWithRole | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  if (project.clientId === clientId) {
    return withOwnerRole(project);
  }

  const [member] = await db
    .select()
    .from(projectMembersTable)
    .where(
      and(
        eq(projectMembersTable.projectId, projectId),
        eq(projectMembersTable.status, "active"),
        or(
          eq(projectMembersTable.clientId, clientId),
          eq(projectMembersTable.email, clientEmail.toLowerCase()),
        ),
      ),
    );
  if (member) {
    return withCollaboratorRole(project);
  }
  return null;
}

router.get(
  "/projects",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const client = req.client!;
    const owned = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.clientId, client.id))
      .orderBy(desc(projectsTable.updatedAt));

    const memberships = await db
      .select({ projectId: projectMembersTable.projectId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.status, "active"),
          or(
            eq(projectMembersTable.clientId, client.id),
            eq(projectMembersTable.email, client.email.toLowerCase()),
          ),
        ),
      );

    const sharedIds = memberships.map((m) => m.projectId);
    const shared =
      sharedIds.length > 0
        ? await db
            .select()
            .from(projectsTable)
            .where(
              and(
                inArray(projectsTable.id, sharedIds),
                ne(projectsTable.clientId, client.id),
              ),
            )
            .orderBy(desc(projectsTable.updatedAt))
        : [];

    const data: ProjectWithRole[] = [
      ...owned.map(withOwnerRole),
      ...shared.map(withCollaboratorRole),
    ];
    res.json(ListMyProjectsResponse.parse({ data }));
  },
);

router.post(
  "/projects",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
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
        summary: parsed.data.summary ?? "",
        liveUrl: parsed.data.liveUrl?.trim() || null,
        coverImageUrl: parsed.data.coverImageUrl?.trim() || null,
        status: "draft",
      })
      .returning();
    res.status(201).json(GetProjectResponse.parse(withOwnerRole(row)));
  },
);

router.get(
  "/projects/:id",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = GetProjectParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await getViewableProject(
      params.data.id,
      req.client!.id,
      req.client!.email,
    );
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(GetProjectResponse.parse(project));
  },
);

router.patch(
  "/projects/:id",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
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
        ...(body.data.summary !== undefined && { summary: body.data.summary }),
        ...(body.data.liveUrl !== undefined && {
          liveUrl: body.data.liveUrl?.trim() ? body.data.liveUrl.trim() : null,
        }),
        ...(body.data.coverImageUrl !== undefined && {
          coverImageUrl: body.data.coverImageUrl?.trim() ? body.data.coverImageUrl.trim() : null,
        }),
        ...(body.data.status !== undefined && { status: body.data.status }),
      })
      .where(and(eq(projectsTable.id, params.data.id), eq(projectsTable.clientId, req.client!.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(UpdateProjectResponse.parse(withOwnerRole(row)));
  },
);

async function ensureOwner(projectId: number, clientId: number): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.clientId, clientId)));
  return project ?? null;
}

router.get(
  "/projects/:id/members",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = ListProjectMembersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await ensureOwner(params.data.id, req.client!.id);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const rows = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, project.id),
          ne(projectMembersTable.status, "removed"),
        ),
      )
      .orderBy(desc(projectMembersTable.invitedAt));
    res.json(ListProjectMembersResponse.parse({ data: rows }));
  },
);

router.post(
  "/projects/:id/members",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = InviteProjectMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = InviteProjectMemberBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const project = await ensureOwner(params.data.id, req.client!.id);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const email = body.data.email.trim().toLowerCase();
    if (!email) {
      res.status(400).json({ error: "Email required" });
      return;
    }

    const [existingClient] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.email, email));

    const [existingMember] = await db
      .select()
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, project.id),
          eq(projectMembersTable.email, email),
        ),
      );

    const isClientActive = existingClient?.status === "active";
    let row;
    if (existingMember) {
      [row] = await db
        .update(projectMembersTable)
        .set({
          status: isClientActive ? "active" : "pending",
          clientId: isClientActive
            ? existingClient!.id
            : (existingMember.clientId ?? null),
          acceptedAt: isClientActive ? new Date() : existingMember.acceptedAt,
        })
        .where(eq(projectMembersTable.id, existingMember.id))
        .returning();
    } else {
      [row] = await db
        .insert(projectMembersTable)
        .values({
          projectId: project.id,
          email,
          clientId: isClientActive ? existingClient!.id : null,
          role: "collaborator",
          status: isClientActive ? "active" : "pending",
          invitedByClientId: req.client!.id,
          acceptedAt: isClientActive ? new Date() : undefined,
        })
        .returning();
    }

    if (!existingClient) {
      await db
        .insert(clientsTable)
        .values({ userId: `pending:${email}`, email, status: "invited" })
        .onConflictDoNothing();
    }

    try {
      await sendProjectInviteEmail({
        to: email,
        projectTitle: project.title,
        invitedByEmail: req.client!.email,
        alreadyHasAccount: Boolean(existingClient),
      });
    } catch (err) {
      logger.warn({ err }, "Failed to send project invite email");
    }

    res.status(201).json(row);
  },
);

router.delete(
  "/projects/:id/members/:memberId",
  requireAuth,
  loadOrCreateClient,
  requireActiveClient,
  async (req, res): Promise<void> => {
    const params = RemoveProjectMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const project = await ensureOwner(params.data.id, req.client!.id);
    if (!project) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const result = await db
      .update(projectMembersTable)
      .set({ status: "removed" })
      .where(
        and(
          eq(projectMembersTable.id, params.data.memberId),
          eq(projectMembersTable.projectId, project.id),
        ),
      )
      .returning({ id: projectMembersTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  },
);

// Used by auth middleware to mark all pending project invites for this email as active.
export async function activatePendingMemberships(
  clientId: number,
  email: string,
): Promise<void> {
  const lowered = email.toLowerCase();
  await db
    .update(projectMembersTable)
    .set({ clientId, status: "active", acceptedAt: new Date() })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "pending"),
      ),
    );

  // Also link any rows that were created before clientId was known
  await db
    .update(projectMembersTable)
    .set({ clientId })
    .where(
      and(
        eq(projectMembersTable.email, lowered),
        eq(projectMembersTable.status, "active"),
        isNotNull(projectMembersTable.email),
      ),
    );
}

export default router;
