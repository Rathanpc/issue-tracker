# Business Requirements Document: Issue Tracker System

**Live application:** https://issue-tracker-six-dusky.vercel.app
**API:** https://issue-tracker-g06t.onrender.com (health check: `/health`)
**Source code:** https://github.com/Rathanpc/issue-tracker

## 1. Purpose and scope
Let small teams log, assign, track and discuss issues. In scope: authentication, issue CRUD, assignment, status tracking, comments, dashboard counts, and two roles (user and admin). Out of scope (v1): notifications, attachments, real-time updates.

## 2. Functional requirements
| ID | Requirement |
|---|---|
| FR1 | Users register, log in and log out |
| FR2 | Logged-in users create, edit and delete issues (users delete only their own; admins delete any) |
| FR3 | Only an admin can assign an issue to a registered user. The assignee can then update its status and comment |
| FR4 | Status is Open, In Progress or Closed and can be changed |
| FR5 | Users comment on issues; comments show author and time |
| FR6 | Dashboard shows total, per-status and assigned-to-me counts |
| FR7 | Issue list filters by status |
| FR8 | Two roles: **user** and **admin**. Registration always creates a user; the first admin is seeded from environment variables |
| FR9 | Users see, edit and comment only on issues they created or are assigned to; their dashboard counts cover only those issues. Users create issues unassigned and can change status on issues they created or are assigned to; only creators (or admins) edit title and description |
| FR10 | Admins see and manage all issues, delete any issue, and use a Users page to list users and promote/demote them (not themselves) |

## 3. Non-functional requirements
Passwords hashed (bcrypt); stateless JWT auth (7-day expiry, bearer token, no cookies); server-side input validation; parameterised SQL; CORS restricted to the frontend origin; responsive UI.

## 4. Acceptance criteria
Register/login works and bad credentials are rejected; unauthenticated API calls return 401; created issues persist after reload and counts update when status changes; deleting an issue removes its comments; a user cannot open or change issues they are not involved in (403); a user cannot call admin endpoints (403); an admin sees all issues and can change roles.

## 5. Deployment

### 5.1 Where it is hosted
| Part | Platform | URL / location |
|---|---|---|
| Frontend (React + Vite) | Vercel | https://issue-tracker-six-dusky.vercel.app |
| Backend API (Node + Express) | Render Web Service (Free, Ohio) | https://issue-tracker-g06t.onrender.com |
| Database (PostgreSQL) | Neon (Free, AWS US East 2) | private connection string in `DATABASE_URL` |
| Source code | GitHub | https://github.com/Rathanpc/issue-tracker |

### 5.2 Deployment approach
The repository holds two apps: `client/` and `server/`. Each is deployed from the same GitHub repo with its own Root Directory, and every push to `main` redeploys both automatically. Secrets live only in each platform's environment settings, and `.env` files are never committed.

### 5.3 Required services
GitHub, Vercel, Render, Neon.

### 5.4 Environment variables
| Platform | Variable | Purpose |
|---|---|---|
| Render | `DATABASE_URL` | Neon connection string (ending in `sslmode=require`) |
| Render | `JWT_SECRET` | Long random string for signing tokens |
| Render | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First admin account, created or reset on every startup |
| Render | `CLIENT_ORIGIN` | Allowed frontend address(es), comma-separated, with `https://` and no trailing slash. Set to `https://issue-tracker-six-dusky.vercel.app` |
| Vercel | `VITE_API_URL` | API base URL: `https://issue-tracker-g06t.onrender.com` (no trailing slash) |

### 5.5 Steps to deploy
1. **Database (Neon).** Create a project, copy the connection string (`postgresql://...`). Tables are created automatically when the API first starts.
2. **Push code.** Create a GitHub repo and push the whole project (`client/` and `server/`). Do not commit `.env`.
3. **API (Render).** New → Web Service → connect the repo. Root Directory `server`, Build Command `npm install`, Start Command `npm start`, Instance Type Free, Region Ohio. Add the Render environment variables from 5.4, then deploy and check `/health` returns `{"ok":true}`.
4. **Frontend (Vercel).** Add New → Project → import the repo. Root Directory `client`, framework preset Vite (build `npm run build`, output `dist`). Add `VITE_API_URL`, then deploy and copy the Vercel URL.
5. **Connect them.** Set `CLIENT_ORIGIN` on Render to the Vercel URL and let the API redeploy. Without this, the browser blocks API requests (CORS).

### 5.6 Updating the application
Commit and push to `main`; Render and Vercel rebuild automatically. Data stays in Neon across deployments. Changing `VITE_API_URL` needs a frontend redeploy because it is baked in at build time. Changing a Render environment variable restarts the API.

### 5.7 Verification
Open the live URL, log in as the admin, create an issue, register a user in a private window, assign the issue to that user, change its status as the user, add a comment, and check the dashboard counts.

### 5.8 Notes
- Render's free tier sleeps when idle, so the first request can take about 30 seconds.
- Local development uses the same `DATABASE_URL` setup described in the README.