### Backend standalone deployment on AWS (separating from main app)

This document lists the minimal code/config changes to run the backend as an independent service in a separate folder/repo and deploy it to AWS. It also covers the few frontend adjustments required to consume the standalone API.

---

## What you’ll end up with
- A standalone Node.js Hono server exposing tRPC at `/api/trpc`
- Docker image for ECS Fargate (or EC2) with environment variables for DB and Supabase
- Prisma migrations deployed automatically on container start
- CORS restricted to your frontend domain

---

## 1) Create a new repository/folder with only the backend

- Copy the entire `backend/` directory into a new folder (or a new repo):
  - Include subfolders: `trpc/`, `prisma/`
  - Include files: `package.json`, `tsconfig.json`
- Do NOT include any code from the main app (e.g., `app/`, `utils/`, `lib/`).

Optional structure example (new repo):

```
backend-standalone/
  package.json
  tsconfig.json
  hono.ts
  server.ts        # new (see below)
  prisma/
    schema.prisma
    client.ts
  trpc/
    app-router.ts
    create-context.ts
    routes/
      ...
  Dockerfile       # new
  .dockerignore    # new
  .env.example     # new
  README.md        # optional
```

---

## 2) Code changes inside the backend

### 2.1 `backend/hono.ts`: mount path fix for tRPC
Change the tRPC mount path to match the client, which calls `${BASE_URL}/api/trpc`.

- Current:
  - Mount: `/trpc/*`
  - Endpoint: `/api/trpc`
- Change to:
  - Mount: `/api/trpc/*`
  - Endpoint: `/api/trpc`

Pseudocode of the relevant lines:

```ts
app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);
```

Also ensure CORS is configurable via env and not wide open in production (see 2.4).

### 2.2 Add `backend/server.ts` to start the Node server
The current `hono.ts` exports the app but does not start an HTTP server. Add a `server.ts` that boots Node with `@hono/node-server` and reads `PORT` from env.

Create a new file `server.ts` with:

```ts
import { serve } from "@hono/node-server";
import app from "./hono.js"; // after build, this resolves to dist/hono.js

const port = Number(process.env.PORT ?? 8081);
serve({ fetch: app.fetch, port });
console.log(`Backend listening on http://0.0.0.0:${port}`);
```

### 2.3 `backend/package.json`: update scripts and deps

- Add dependency:
  - `@hono/node-server`
- Update scripts:
  - `dev`: `node --loader ts-node/esm server.ts`
  - `build`: `tsc`
  - `start:prod`: `node dist/server.js`

Example snippet:

```json
{
  "scripts": {
    "dev": "node --loader ts-node/esm server.ts",
    "build": "tsc",
    "start:prod": "node dist/server.js",
    "migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.3"
  }
}
```

Note: keep `type: "module"` as-is (ESM) and ensure imports have `.js` suffix in built output, which your code already uses.

### 2.4 `backend/hono.ts`: make CORS origin configurable
Replace hardcoded `origin: "*"` with an env-driven value.

```ts
const corsOrigin = process.env.CORS_ORIGIN ?? "*"; // set to your frontend URL in prod
app.use("*", cors({ origin: corsOrigin, ... }));
```

### 2.5 `backend/trpc/create-context.ts`: env vars and logging

- Continue to support current env vars but also allow server-style names:
  - Prefer `SUPABASE_URL` and `SUPABASE_ANON_KEY`, fallback to `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Remove sensitive token logs in production (or guard them):

```ts
const isDev = process.env.NODE_ENV !== "production";
if (isDev) {
  console.log("[Context] SUPABASE_URL present:", !!process.env.SUPABASE_URL || !!process.env.EXPO_PUBLIC_SUPABASE_URL);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// When logging tokens, only in dev and only partial prefix
if (isDev && token) console.log("token:", token.substring(0, 20) + "...");
```

No functional change to auth logic; just safer env names and logs.

---

## 3) Add deployment assets

### 3.1 `.env.example`

```
PORT=8081
CORS_ORIGIN=https://your-frontend.example.com

# Database (PostgreSQL)
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB?schema=public

# Supabase Auth
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

### 3.2 `Dockerfile`

```Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

# 1) Install production deps for final image
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Build TypeScript and generate Prisma client with dev deps available
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx prisma generate

# 3) Final runtime image (no dev deps)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Overwrite with generated Prisma artifacts from build stage
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# App build output and prisma schema
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./package.json

EXPOSE 8081
CMD ["node", "dist/server.js"]
```

### 3.3 `.dockerignore`

```
node_modules
dist
.git
.env
**/*.log
```

---

## 4) Database and migrations

- Use a managed Postgres (AWS RDS) or keep Supabase Postgres. Ensure outbound network access (and any IP allowlist) from your AWS tasks to the DB.
- At deployment time, run Prisma migrations:
  - ECS task entrypoint: run `npm run migrate:deploy` once per release (or as an init container / task)
  - Or run it manually from CI/CD targeting the same `DATABASE_URL`

---

## 5) AWS deployment (ECS Fargate recommended)

- Build and push the Docker image to ECR.
- Create an ECS Fargate service:
  - Task definition: set env vars `PORT`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGIN`
  - CPU/memory: e.g., 0.25 vCPU / 512MB to start
  - Expose container port `8081`
  - Attach to an Application Load Balancer (ALB)
  - Health check path: `/` (already implemented)
- Security groups:
  - Allow ALB → service traffic on 8081
  - Allow service → DB (RDS) on 5432, or general outbound if using Supabase

EC2 alternative: run the Docker image directly or use PM2 with Node 20; the app still listens on `PORT`.

---

## 6) Frontend changes to consume standalone backend

- Set `EXPO_PUBLIC_API_URL` to your deployed base URL, e.g. `https://api.example.com` (no trailing slash). The clients already append `/api/trpc`.
  - For Expo, set it in your build environment or `app.json` → `expo.extra` and ensure it is available in builds as `EXPO_PUBLIC_API_URL`.
- Optional cleanup: since the frontend currently has an API route that dynamically imports backend code (`app/api/trpc/[trpc]+api.ts`), either:
  - Remove that file if you won’t proxy through the app anymore; or
  - Keep it but ensure the frontend always calls the external URL by providing `EXPO_PUBLIC_API_URL` (web will otherwise fall back to relative path).

No other frontend code changes are required because `utils/trpc.ts` and `lib/trpc.ts` already respect `EXPO_PUBLIC_API_URL`.

### 6.1 Decouple type imports from backend (important)

Currently the frontend imports `AppRouter` type from the backend (e.g., `lib/trpc.ts`, `utils/trpc.ts`). After separation, this creates a hard coupling and will break builds.

Choose one:
- Preferred: Create a small shared package (e.g., `@cramit/backend-types`) that exports only the `AppRouter` type compiled to `.d.ts`, and depend on it from both projects.
- Quick workaround: Change `createTRPCReact<AppRouter>()` to `createTRPCReact<any>()` (and the associated client generics) in the frontend until a shared types package is set up.

Additionally, remove any alias imports like `"@/backend/..."` from the frontend.

---

## 7) Production hardening checklist

- Set `CORS_ORIGIN` to the exact frontend origin(s), not `*`.
- Remove or guard any sensitive logs in `create-context.ts` (token prefixes only in dev).
- Use unique, least-privilege DB credentials for the app.
- Rotate `SUPABASE_ANON_KEY` only if necessary; do not use service role on the server unless you enforce Row Level Security carefully.
- Ensure ALB/CloudFront uses HTTPS.

---

## 8) Quick test locally (standalone)

```bash
# from the new standalone backend folder
npm ci
cp .env.example .env  # fill values
npx prisma generate
npx prisma migrate deploy
npm run dev

# Test health
curl http://localhost:8081/
# Test tRPC endpoint path exists (will return 405/404 for GET, but path should be mounted):
curl -i http://localhost:8081/api/trpc
```

If you see the health JSON on `/`, the server is running in standalone mode.

---

## 9) Summary of exact edits

- `backend/hono.ts`
  - Mount tRPC at: `app.use("/api/trpc/*", trpcServer({ endpoint: "/api/trpc", ... }))`
  - Make `origin` in CORS configurable via `CORS_ORIGIN`
- Add `backend/server.ts` to start the server with `@hono/node-server`
- `backend/package.json`
  - Add `@hono/node-server`
  - Update scripts to run `server.ts` in dev and `dist/server.js` in prod
  - Add `migrate:deploy` for Prisma
- `backend/trpc/create-context.ts`
  - Support `SUPABASE_URL` and `SUPABASE_ANON_KEY` envs (fallback to existing `EXPO_PUBLIC_*`)
  - Remove/guard token logging in production
- New files: `.env.example`, `Dockerfile`, `.dockerignore`
- Frontend: set `EXPO_PUBLIC_API_URL=https://api.example.com` and optionally remove `app/api/trpc/[trpc]+api.ts`

