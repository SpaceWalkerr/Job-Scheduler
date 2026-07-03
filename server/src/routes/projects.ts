import { Router } from "express";
import { pool, query } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth, type AuthRequest } from "../auth.js";
import { orgRole, defaultOrgId } from "../membership.js";
import { broadcast } from "../ws.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { organization_id } = req.query;
    const params: unknown[] = [req.userId];
    let sql = `select p.*, pm.role as my_role, o.name as organization_name
               from projects p
               join project_members pm on pm.project_id = p.id
               join organizations o on o.id = p.organization_id
               where pm.user_id = $1`;
    if (organization_id) {
      params.push(organization_id);
      sql += ` and p.organization_id = $${params.length}`;
    }
    sql += " order by p.created_at desc";
    const { rows } = await query(sql, params);
    res.json(rows);
  })
);

router.post(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { name, organization_id } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name is required" });

    // Place the project in the requested org (caller must be a member) or fall back to
    // the user's personal org.
    let orgId = organization_id as string | undefined;
    if (orgId) {
      if (!(await orgRole(orgId, req.userId!))) {
        return res.status(404).json({ error: "organization not found" });
      }
    } else {
      orgId = (await defaultOrgId(req.userId!)) ?? undefined;
      if (!orgId) return res.status(400).json({ error: "no organization available" });
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "insert into projects (user_id, organization_id, name) values ($1, $2, $3) returning *",
        [req.userId, orgId, name]
      );
      await client.query(
        "insert into project_members (project_id, user_id, role) values ($1, $2, 'admin')",
        [rows[0].id, req.userId]
      );
      const org = await client.query("select name from organizations where id = $1", [orgId]);
      await client.query("commit");
      broadcast("projects");
      res.status(201).json({ ...rows[0], my_role: "admin", organization_name: org.rows[0]?.name });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  })
);

async function requireAdminMember(projectId: string, userId: string) {
  const { rows } = await query(
    "select role from project_members where project_id = $1 and user_id = $2",
    [projectId, userId]
  );
  return rows[0]?.role === "admin";
}

router.get(
  "/:id/members",
  wrap(async (req: AuthRequest, res) => {
    const isMember = await query(
      "select 1 from project_members where project_id = $1 and user_id = $2",
      [req.params.id, req.userId]
    );
    if (!isMember.rowCount) return res.status(404).json({ error: "project not found" });

    const { rows } = await query(
      `select u.email, pm.role, pm.created_at
       from project_members pm
       join users u on u.id = pm.user_id
       where pm.project_id = $1
       order by pm.created_at`,
      [req.params.id]
    );
    res.json(rows);
  })
);

router.post(
  "/:id/members",
  wrap(async (req: AuthRequest, res) => {
    const { email, role = "viewer" } = req.body ?? {};
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!["admin", "viewer"].includes(role)) {
      return res.status(400).json({ error: "role must be 'admin' or 'viewer'" });
    }
    if (!(await requireAdminMember(req.params.id, req.userId!))) {
      return res.status(403).json({ error: "only project admins can invite members" });
    }
    const user = await query("select id from users where email = $1", [email]);
    if (!user.rowCount) {
      return res.status(404).json({ error: "no account with that email — they must register first" });
    }
    const { rows } = await query(
      `insert into project_members (project_id, user_id, role)
       values ($1, $2, $3)
       on conflict (project_id, user_id) do update set role = excluded.role
       returning role`,
      [req.params.id, user.rows[0].id, role]
    );
    broadcast("projects");
    res.status(201).json({ email, role: rows[0].role });
  })
);

router.delete(
  "/:id/members/:email",
  wrap(async (req: AuthRequest, res) => {
    if (!(await requireAdminMember(req.params.id, req.userId!))) {
      return res.status(403).json({ error: "only project admins can remove members" });
    }
    const { rowCount } = await query(
      `delete from project_members
       where project_id = $1 and user_id = (select id from users where email = $2)`,
      [req.params.id, req.params.email]
    );
    if (!rowCount) return res.status(404).json({ error: "member not found" });
    broadcast("projects");
    res.status(204).end();
  })
);

export default router;
