import { Router } from "express";
import { pool, query } from "../db.js";
import { wrap } from "../http.js";
import { hashPassword, verifyPassword, signToken } from "../auth.js";

const router = Router();

router.post(
  "/register",
  wrap(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const existing = await query("select id from users where email = $1", [email]);
    if (existing.rowCount) {
      return res.status(409).json({ error: "email already registered" });
    }
    const hash = await hashPassword(password);

    // Create the user and their personal organization together so a project always
    // has an org to belong to from the very first request.
    const client = await pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query(
        "insert into users (email, password_hash) values ($1, $2) returning id, email, created_at",
        [email, hash]
      );
      const user = rows[0];
      const org = await client.query(
        "insert into organizations (name, owner_user_id) values ($1, $2) returning id",
        [`${email}'s org`, user.id]
      );
      await client.query(
        "insert into organization_members (organization_id, user_id, role) values ($1, $2, 'owner')",
        [org.rows[0].id, user.id]
      );
      await client.query("commit");
      res.status(201).json({ user, token: signToken(user.id) });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  })
);

router.post(
  "/login",
  wrap(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const { rows } = await query("select * from users where email = $1", [email]);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: "invalid credentials" });
    }
    res.json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token: signToken(user.id),
    });
  })
);

export default router;
