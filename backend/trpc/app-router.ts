import { createTRPCRouter } from "./create-context.js";
import { hiProcedure } from "./routes/example/hi/route.js";
import { flashcardRouter } from "./routes/flashcards/router.js";
import { authRouter } from "./routes/auth/router.js";
import { deckRouter } from "./routes/deck.router.js";
import { adminRouter } from "./routes/adminRouter.js";

export const appRouter = createTRPCRouter({
  example: createTRPCRouter({
    hi: hiProcedure,
  }),
  flashcards: flashcardRouter,
  auth: authRouter,
  deck: deckRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;