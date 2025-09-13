import { serve } from "@hono/node-server";
import app from "./hono.js"; // after build, this resolves to dist/hono.js

const port = Number(process.env.PORT ?? 8081);
serve({ fetch: app.fetch, port });
console.log(`Backend listening on http://0.0.0.0:${port}`);



