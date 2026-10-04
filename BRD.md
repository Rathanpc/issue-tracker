# Business Requirements Document: Issue Tracker System

## 1. Purpose and scope
Let small teams log, assign, track and discuss issues. In scope: auth, issue CRUD, assignment, status tracking, comments, dashboard counts. Out of scope (v1): notifications, attachments, roles, real-time updates.

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
Passwords hashed (bcrypt); stateless JWT auth (7-day expiry); server-side input validation; parameterised SQL; CORS restricted to the frontend origin; responsive UI.

## 4. Acceptance criteria
Register/login works and bad credentials are rejected; unauthenticated API calls return 401; created issues persist after reload and counts update when status changes; deleting an issue removes its comments; a user cannot open or change issues they are not involved in (403); a user cannot call admin endpoints (403); an admin sees all issues and can change roles.

## 5. Deployment
**Hosting:** frontend on **Vercel**, backend on **Render** (Web Service), database on **Neon** (managed PostgreSQL, free tier). GitHub is the source for both apps; every push to `main` redeploys.

**Required services:** GitHub, Vercel, Render, Neon.

**Step 1: Database (Neon).** Create a project, copy the connection string (`postgresql://...`). Tables are created automatically when the API first starts.

**Step 2: Push code.** Create a GitHub repo and push the whole project (`client/` and `server/`). Do not commit `.env`.

**Step 3: Deploy the API (Render).**
1. New → Web Service → connect the repo.
2. Root Directory `server`; Runtime Node; Build Command `npm install`; Start Command `npm start`.
3. Environment: `DATABASE_URL` (from Neon), `JWT_SECRET` (long random), `ADMIN_EMAIL` and `ADMIN_PASSWORD` (first admin), `CLIENT_ORIGIN` (set after step 4).
4. Deploy and check `https://<your-api>.onrender.com/health` returns `{"ok":true}`.

**Step 4: Deploy the frontend (Vercel).**
1. Add New → Project → import the repo; Root Directory `client`; framework preset Vite (build `npm run build`, output `dist`).
2. Environment variable: `VITE_API_URL=https://<your-api>.onrender.com`.
3. Deploy and copy the Vercel URL.

**Step 5: Connect them.** Set `CLIENT_ORIGIN` on Render to the Vercel URL (no trailing slash) and redeploy the API. Put both URLs in `README.md`.

**Updating:** commit and push to `main`; Render and Vercel rebuild automatically. Data stays in Neon across deployments. Changing `VITE_API_URL` needs a frontend redeploy because it is baked in at build time.

**Verification:** open the Vercel URL, log in as the admin, create an issue, register a user in a private window, assign the issue, change its status as the user, and check the dashboard.

**Notes:** Render's free tier sleeps when idle, so the first request can take about 30 seconds. Local development uses the same `DATABASE_URL` setup described in the README.
