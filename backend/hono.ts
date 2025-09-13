// Environment check to prevent accidental execution in non-Node environments
if (typeof process === 'undefined' || typeof process.stdout === 'undefined') {
  throw new Error('Backend module loaded in non-Node environment; aborting startup.');
}

import { Hono } from "hono";
import { trpcServer } from "@hono/trpc-server";
import { cors } from "hono/cors";
import { appRouter } from "./trpc/app-router.js";
import { createContext } from "./trpc/create-context.js";

// app will be mounted at /api
const app = new Hono();

// Enable CORS for all routes with configurable origin
const corsOrigin = process.env.CORS_ORIGIN ?? "*"; // set to your frontend URL in prod
app.use("*", cors({
  origin: corsOrigin,
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}));

// Mount tRPC router at /api/trpc
app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  })
);

// Simple health check endpoint
app.get("/", (c) => {
  return c.json({ 
    status: "ok", 
    message: "Flashcard App API is running",
    timestamp: new Date().toISOString()
  });
});

export default app;