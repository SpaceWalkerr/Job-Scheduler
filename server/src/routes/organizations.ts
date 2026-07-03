import { Router } from "express";
import { pool, query } from "../db.js";
import { wrap } from "../http.js";
import { requireAuth, type AuthRequest } from "../auth.js";
import { orgRole } from "../membership.js";
import { broadcast } from "../ws.js";

const router = Router();
router.use(requireAuth);

// Organizations the caller belongs to, with their role and a project count.
router.get(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { rows } = await query(
      `select o.id, o.name, o.created_at, om.role,
              (select count(*)::int from projects p where p.organization_id = o.id) as project_count
       from organizations o
       join organization_members om on om.organization_id = o.id
       where om.user_id = $1
       order by o.created_at`,
      [req.userId]
    );
    res.json(rows);
  })
);

router.post(
  "/",
  wrap(async (req: AuthRequest, res) => {
    const { name } = req.body ?? {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "insert into organizations (name, owner_user_id) values ($1, $2) returning *",
        [name, req.userId]
      );
      await client.query(
        "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')",
        [rows[0].id, req.userId]
      );
      await client.query("commit");
      broadcast("projects");
      res.status(201).json({ ...rows[0], role: "owner", project_count: 0 });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.get(
  "/:id/members",
  wrap(async (req: AuthRequest, res) => {
    if (!(await orgRole(req.params.id, req.userId!))) {
      return res.status(404).json({ error: "organization not found" });
    }
    const { rows } = await query(
      `select u.email, om.role, om.created_at
       from organization_members om
       join users u on u.id = om.user_id
       where om.organization_id = $1
       order by om.created_at`,
      [req.params.id]
    );
    res.json(rows);
  })
);

router.post(
  "/:id/members",
  wrap(async (req: AuthRequest, res) => {
    const { email, role = "member" } = req.body ?? {};
    if (!email) return res.status(400).json({ error: "email is required" });
    if (!["owner", "member"].includes(role)) {
      return res.status(400).json({ error: "role must be 'owner' or 'member'" });
    }
    if ((await orgRole(req.params.id, req.userId!)) !== "owner") {
      return res.status(403).json({ error: "only organization owners can invite members" });
    }
    const user = await query("select id from users where email = $1", [email]);
    if (!user.rowCount) {
      return res.status(404).json({ error: "no account with that email — they must register first" });
    }
    const { rows } = await query(
      `insert into organization_members (organization_id, user_id, role)
       values ($1, $2, $3)
       on conflict (organization_id, user_id) do update set role = excluded.role
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
    if ((await orgRole(req.params.id, req.userId!)) !== "owner") {
      return res.status(403).json({ error: "only organization owners can remove members" });
    }
    const { rows: target } = await query(
      "select id from users where email = $1",
      [req.params.email]
    );
    if (!target.length) return res.status(404).json({ error: "member not found" });
    // Don't let the org be left ownerless.
    const owners = await query<{ c: number }>(
      "select count(*)::int as c from organization_members where organization_id = $1 and role = 'owner'",
      [req.params.id]
    );
    const targetIsOwner = await query<{ role: string }>(
      "select role from organization_members where organization_id = $1 and user_id = $2",
      [req.params.id, target[0].id]
    );
    if (targetIsOwner.rows[0]?.role === "owner" && owners.rows[0].c <= 1) {
      return res.status(400).json({ error: "cannot remove the last owner" });
    }
    const { rowCount } = await query(
      "delete from organization_members where organization_id = $1 and user_id = $2",
      [req.params.id, target[0].id]
    );
    if (!rowCount) return res.status(404).json({ error: "member not found" });
    broadcast("projects");
    res.status(204).end();
  })
);

export default router;
