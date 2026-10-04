# Issue Tracker System

A full-stack issue tracker: register/login, create/edit/delete issues, assign to users, track status (Open / In Progress / Closed), comment, and view a dashboard with counts.

-- **Live frontend:** https://issue-tracker-six-dusky.vercel.app
- **Live API:** https://issue-tracker-g06t.onrender.com
- **Repository:** https://github.com/Rathanpc/issue-tracker
## Features
- JWT authentication with bcrypt-hashed passwords
- Issue CRUD (only the creator can delete), assignment to any registered user
- Status tracking, status filter, comments with author and timestamp
- Dashboard: total, per-status and "assigned to me" counts

## Roles
| Capability | User | Admin |
|---|---|---|
| Register / login | yes | yes |
| Create issues | yes (created unassigned) | yes |
| **Assign issues to users** | **no** | **yes** |
| See issues | only ones they created or are assigned to | all issues |
| Change status, comment | on issues they created or are assigned to | on any issue |
| Edit title/description | only issues they created | any issue |
| Delete issue | only their own | any issue |
| Dashboard counts | scoped to their issues | all issues |
| Users page (list users, promote/demote) | no | yes |

Everyone who registers on the website is a **user**. The first **admin** is created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` when the server starts (if that email already exists, it is promoted). Admins can then promote others from the Users page. Permissions are enforced on the server.

## Architecture
```
React (Vite SPA, Vercel)  --HTTPS/JSON + Bearer JWT-->  Express API (Render)  -->  PostgreSQL (Neon)
```
```
client/   React 18 + Vite   (src/App.jsx UI, src/api.js fetch wrapper)
server/   Node + Express    (index.js: routes, validation; tables are created automatically on start)
```
Tables: `users`, `issues` (assignee_id, creator_id, status), `comments` (cascade-deleted with the issue).

## Tech stack
React 18, Vite, Node.js 18+, Express 4, pg (PostgreSQL), jsonwebtoken, bcryptjs, cors, dotenv.

## Local setup
```bash
git clone https://github.com/<your-username>/issue-tracker.git && cd issue-tracker

# backend
cd server && cp .env.example .env     # set JWT_SECRET and DATABASE_URL (see below)
npm install && npm run dev            # http://localhost:4000

# frontend (new terminal)
cd client && cp .env.example .env
npm install && npm run dev            # http://localhost:5173
```

### Database (PostgreSQL)
The easiest option needs no local install: create a free project at [neon.tech](https://neon.tech), copy its connection string (starts with `postgresql://`) and paste it as `DATABASE_URL` in `server/.env`. Any PostgreSQL works (Supabase, Render Postgres, or a local server). Tables are created on first start.

## Environment variables
| Where | Name | Purpose |
|---|---|---|
| server | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Creates/promotes the first admin account at startup |
| server | `JWT_SECRET` | **Required.** Long random string for signing tokens |
| server | `CLIENT_ORIGIN` | Allowed frontend origin(s), comma-separated (e.g. `https://app.vercel.app`) |
| server | `DATABASE_URL` | **Required.** PostgreSQL connection string |
| server | `PORT` | Port (platforms usually set this) |
| client | `VITE_API_URL` | Base URL of the API (no trailing slash) |

## API details
All `/api/*` routes except auth require `Authorization: Bearer <token>`. Errors return `{ "error": "message" }`.

| Method & path | Body | Description |
|---|---|---|
| `POST /api/auth/register` | `{name,email,password}` | Create user, returns `{token,user}` |
| `POST /api/auth/login` | `{email,password}` | Returns `{token,user}` |
| `GET /api/me` | | Current user including `role` |
| `GET /api/users` | | List users (for assignment) |
| `GET /api/admin/users` | | **Admin.** Users with role and issue counts |
| `PUT /api/admin/users/:id/role` | `{role:"user"|"admin"}` | **Admin.** Change a user's role |
| `GET /api/dashboard` | | `{total,byStatus,assignedToMe}` |
| `GET /api/issues?status=Open` | | List issues (status optional) |
| `GET /api/issues/:id` | | Issue with `comments[]` |
| `POST /api/issues` | `{title,description?,status?,assignee_id?}` | Create |
| `PUT /api/issues/:id` | any of the above fields | Edit / change status. `assignee_id` is admin-only; title/description need creator or admin |
| `DELETE /api/issues/:id` | | Delete (creator or admin) |
| `POST /api/issues/:id/comments` | `{text}` | Add comment |
| `GET /health` | | Health check |

## Deployment
Backend on Render, frontend on Vercel. Full steps are in the **Deployment** section of `BRD.md`.
