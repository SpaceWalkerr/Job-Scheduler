import { query } from "./db.js";

export type Role = "admin" | "viewer";
export type OrgRole = "owner" | "member";

export async function orgRole(organizationId: string, userId: string): Promise<OrgRole | null> {
  const { rows } = await query<{ role: OrgRole }>(
    "select role from organization_members where organization_id = $1 and user_id = $2",
    [organizationId, userId]
  );
  return rows[0]?.role ?? null;
}

// The org a user's projects default into: their earliest-owned org, which registration
// always creates first, so team orgs made later never shadow it.
export async function defaultOrgId(userId: string): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    "select id from organizations where owner_user_id = $1 order by created_at limit 1",
    [userId]
  );
  return rows[0]?.id ?? null;
}

export async function projectRole(projectId: string, userId: string): Promise<Role | null> {
  const { rows } = await query<{ role: Role }>(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId]
  );
  return rows[0]?.role ?? null;
}

export async function queueRole(queueId: string, userId: string): Promise<Role | null> {
  const { rows } = await query<{ role: Role }>(
    `select pm.role from queues q
     join project_members pm on pm.project_id = q.project_id
     where q.id = $1 and pm.user_id = $2`,
    [queueId, userId]
  );
  return rows[0]?.role ?? null;
}

export async function jobRole(jobId: string, userId: string): Promise<Role | null> {
  const { rows } = await query<{ role: Role }>(
    `select pm.role from jobs j
     join queues q on q.id = j.queue_id
     join project_members pm on pm.project_id = q.project_id
     where j.id = $1 and pm.user_id = $2`,
    [jobId, userId]
  );
  return rows[0]?.role ?? null;
}
