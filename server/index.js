require('dotenv').config();
const express = require('express'), cors = require('cors'), bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'), { Pool } = require('pg');

const SECRET = process.env.JWT_SECRET, DB_URL = process.env.DATABASE_URL;
if (!SECRET || !DB_URL) { console.error('JWT_SECRET and DATABASE_URL are required'); process.exit(1); }
const STATUSES = ['Open', 'In Progress', 'Closed'];

const pool = new Pool({ connectionString: DB_URL, ssl: /localhost|127\.0\.0\.1/.test(DB_URL) ? false : { rejectUnauthorized: false } });
const q = (sql, p = []) => pool.query(sql, p);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user');
CREATE TABLE IF NOT EXISTS issues(id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Open',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL, creator_id INTEGER NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS comments(id SERIAL PRIMARY KEY, issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());`;

async function init() {
  await q(SCHEMA);
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {   // seed / promote the first admin
   await q(`INSERT INTO users(name,email,password,role) VALUES('Admin',$1,$2,'admin') ON CONFLICT (email) DO UPDATE SET role='admin', password=EXCLUDED.password`,
      [process.env.ADMIN_EMAIL.trim().toLowerCase(), bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10)]);
  }
}

const ISSUE_SQL = `SELECT i.*, a.name AS assignee_name, c.name AS creator_name,
  (SELECT COUNT(*)::int FROM comments WHERE issue_id = i.id) AS comment_count
  FROM issues i LEFT JOIN users a ON a.id = i.assignee_id JOIN users c ON c.id = i.creator_id`;
const COMMENT_SQL = 'SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id=c.user_id';

const app = express();
app.use(cors({ origin: (process.env.CLIENT_ORIGIN || '*').split(',') }));
app.use(express.json({ limit: '100kb' }));
app.param('id', (req, res, next, v) => (/^\d+$/.test(v) ? next() : res.status(400).json({ error: 'Invalid id' })));

const h = fn => (req, res, next) => fn(req, res).catch(next);
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function auth(req, res, next) {
  try {
    const id = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET).id;
    const u = (await q('SELECT id,name,email,role FROM users WHERE id=$1', [id])).rows[0];
    if (!u) throw new Error('no user');
    req.user = u; req.userId = u.id; next();
  } catch { bad(res, 'Unauthorized', 401); }
}
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : bad(res, 'Admin access required', 403));
const isAdmin = req => req.user.role === 'admin';
// users only see issues they created or are assigned to; admins see everything
const canSee = (req, i) => isAdmin(req) || i.creator_id === req.userId || i.assignee_id === req.userId;
const getIssueRow = async id => (await q('SELECT creator_id, assignee_id FROM issues WHERE id=$1', [id])).rows[0];
const fullIssue = async id => (await q(ISSUE_SQL + ' WHERE i.id=$1', [id])).rows[0];

app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', h(async (req, res) => {
  const name = str(req.body.name, 80), email = str(req.body.email, 120).toLowerCase(), pw = req.body.password;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof pw !== 'string' || pw.length < 6)
    return bad(res, 'Name, valid email and password (6+ chars) are required');
  const { rows } = await q('INSERT INTO users(name,email,password) VALUES($1,$2,$3) ON CONFLICT (email) DO NOTHING RETURNING *', [name, email, bcrypt.hashSync(pw, 10)]);
  if (!rows[0]) return bad(res, 'Email already registered', 409);
  res.status(201).json({ token: sign(rows[0]), user: pub(rows[0]) });
}));

app.post('/api/auth/login', h(async (req, res) => {
  const u = (await q('SELECT * FROM users WHERE email=$1', [str(req.body.email, 120).toLowerCase()])).rows[0];
  if (!u || typeof req.body.password !== 'string' || !bcrypt.compareSync(req.body.password, u.password))
    return bad(res, 'Invalid email or password', 401);
  res.json({ token: sign(u), user: pub(u) });
}));

app.use('/api', auth);

app.get('/api/me', (req, res) => res.json(pub(req.user)));
app.get('/api/users', h(async (_, res) => res.json((await q('SELECT id,name,email FROM users ORDER BY name')).rows)));

// ---- admin only ----
app.get('/api/admin/users', adminOnly, h(async (_, res) => res.json((await q(
  `SELECT u.id,u.name,u.email,u.role,(SELECT COUNT(*)::int FROM issues WHERE creator_id=u.id) AS created,
   (SELECT COUNT(*)::int FROM issues WHERE assignee_id=u.id) AS assigned FROM users u ORDER BY u.id`)).rows)));

app.put('/api/admin/users/:id/role', adminOnly, h(async (req, res) => {
  if (!['user', 'admin'].includes(req.body.role)) return bad(res, 'Role must be user or admin');
  if (Number(req.params.id) === req.userId) return bad(res, 'You cannot change your own role');
  const r = await q('UPDATE users SET role=$1 WHERE id=$2', [req.body.role, req.params.id]);
  if (!r.rowCount) return bad(res, 'User not found', 404);
  res.json({ ok: true });
}));

// ---- dashboard & issues (scoped by role) ----
app.get('/api/dashboard', h(async (req, res) => {
  const adm = isAdmin(req);
  const rows = (await q('SELECT status, COUNT(*)::int n FROM issues' + (adm ? '' : ' WHERE (creator_id=$1 OR assignee_id=$1)') + ' GROUP BY status', adm ? [] : [req.userId])).rows;
  const counts = Object.fromEntries(STATUSES.map(s => [s, 0]));
  rows.forEach(r => (counts[r.status] = r.n));
  const mine = (await q("SELECT COUNT(*)::int n FROM issues WHERE assignee_id=$1 AND status!='Closed'", [req.userId])).rows[0].n;
  res.json({ total: Object.values(counts).reduce((a, b) => a + b, 0), byStatus: counts, assignedToMe: mine });
}));

app.get('/api/issues', h(async (req, res) => {
  const where = [], p = [];
  if (!isAdmin(req)) { p.push(req.userId); where.push(`(i.creator_id=$${p.length} OR i.assignee_id=$${p.length})`); }
  if (STATUSES.includes(req.query.status)) { p.push(req.query.status); where.push(`i.status=$${p.length}`); }
  res.json((await q(ISSUE_SQL + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY i.id DESC', p)).rows);
}));

app.get('/api/issues/:id', h(async (req, res) => {
  const row = await getIssueRow(req.params.id);
  if (!row) return bad(res, 'Issue not found', 404);
  if (!canSee(req, row)) return bad(res, 'You do not have access to this issue', 403);
  const i = await fullIssue(req.params.id);
  i.comments = (await q(COMMENT_SQL + ' WHERE issue_id=$1 ORDER BY c.id', [i.id])).rows;
  res.json(i);
}));

async function validIssue(b, partial) {
  const out = {};
  if (!partial || b.title !== undefined) { out.title = str(b.title, 200); if (!out.title) return { error: 'Title is required' }; }
  if (b.description !== undefined) out.description = str(b.description, 5000);
  if (b.status !== undefined) { if (!STATUSES.includes(b.status)) return { error: 'Invalid status' }; out.status = b.status; }
  if (b.assignee_id !== undefined) {
    if (b.assignee_id !== null && (!Number.isInteger(b.assignee_id) || !(await q('SELECT 1 FROM users WHERE id=$1', [b.assignee_id])).rowCount))
      return { error: 'Assignee not found' };
    out.assignee_id = b.assignee_id;
  }
  return { out };
}

app.post('/api/issues', h(async (req, res) => {
  const { out, error } = await validIssue(req.body, false);
  if (error) return bad(res, error);
  if (!isAdmin(req) && out.assignee_id) return bad(res, 'Only an admin can assign issues', 403);
  const id = (await q('INSERT INTO issues(title,description,status,assignee_id,creator_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
    [out.title, out.description || '', out.status || 'Open', out.assignee_id ?? null, req.userId])).rows[0].id;
  res.status(201).json(await fullIssue(id));
}));

app.put('/api/issues/:id', h(async (req, res) => {
  const row = await getIssueRow(req.params.id);
  if (!row) return bad(res, 'Issue not found', 404);
  if (!canSee(req, row)) return bad(res, 'You do not have access to this issue', 403);
  const { out, error } = await validIssue(req.body, true);
  if (error) return bad(res, error);
  if (!isAdmin(req)) {
    if (out.assignee_id !== undefined) return bad(res, 'Only an admin can assign issues', 403);
    if ((out.title !== undefined || out.description !== undefined) && row.creator_id !== req.userId)
      return bad(res, 'Only the creator or an admin can edit the title and description', 403);
  }
  const keys = Object.keys(out);
  if (keys.length) await q(`UPDATE issues SET ${keys.map((k, n) => `${k}=$${n + 1}`).join(',')} WHERE id=$${keys.length + 1}`, [...keys.map(k => out[k]), req.params.id]);
  res.json(await fullIssue(req.params.id));
}));

app.delete('/api/issues/:id', h(async (req, res) => {
  const row = await getIssueRow(req.params.id);
  if (!row) return bad(res, 'Issue not found', 404);
  if (!isAdmin(req) && row.creator_id !== req.userId) return bad(res, 'Only the creator or an admin can delete this issue', 403);
  await q('DELETE FROM issues WHERE id=$1', [req.params.id]);
  res.status(204).end();
}));

app.post('/api/issues/:id/comments', h(async (req, res) => {
  const row = await getIssueRow(req.params.id);
  if (!row) return bad(res, 'Issue not found', 404);
  if (!canSee(req, row)) return bad(res, 'You do not have access to this issue', 403);
  const text = str(req.body.text, 2000);
  if (!text) return bad(res, 'Comment text is required');
  const id = (await q('INSERT INTO comments(issue_id,user_id,text) VALUES($1,$2,$3) RETURNING id', [req.params.id, req.userId, text])).rows[0].id;
  res.status(201).json((await q(COMMENT_SQL + ' WHERE c.id=$1', [id])).rows[0]);
}));

app.use((err, _req, res, _next) => { console.error(err); bad(res, 'Server error', 500); });
init().then(() => app.listen(process.env.PORT || 4000, () => console.log('API listening on', process.env.PORT || 4000)))
  .catch(e => { console.error('Database init failed:', e.message); process.exit(1); });
