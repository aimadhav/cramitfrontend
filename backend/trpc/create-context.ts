import { initTRPC, TRPCError } from "@trpc/server";
import { getPrismaClient } from "../prisma/client.js";
import { createClient } from "@supabase/supabase-js";
// import superjson from "superjson";

console.log("[Backend Context] create-context.ts loaded");

// Hardcoded values instead of dotenv
const PORT = 8081;
const CORS_ORIGIN = "*";

const isDev = true; // since you're running local/dev
console.log("[Backend Context] Hardcoded ENV values loaded.");

// Supabase Config (Hardcoded)
const supabaseUrl = "https://megjoogojbtiqyjxfnve.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZ2pvb2dvamJ0aXF5anhmbnZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc5Nzc4MjYsImV4cCI6MjA2MzU1MzgyNn0.gXRXBVjgYDq38RDEmycOiwRXYChgE3AD5t5-7dVUrvs";

const databaseUrl =
  "postgresql://postgres.megjoogojbtiqyjxfnve:MADHAV%402005joshi@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";

const testDatabaseUrl =
  "postgresql://postgres:madhav@123@localhost:5432/cramit_test";

const apiUrl = "http:// 192.168.0.104:8081";

// Helper function to get user from JWT
const getUserFromHeader = async (req, supabase) => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    console.log(
      "[Backend Context] getUserFromHeader: No authorization header found."
    );
    return null;
  }

  const token = authHeader.split("Bearer ")[1];
  if (!token) {
    console.log(
      "[Backend Context] getUserFromHeader: Authorization header found, but no token after 'Bearer '."
    );
    return null;
  }

  if (isDev && token) {
    console.log(
      "[Backend Context] getUserFromHeader: Received token:",
      token.substring(0, 20) + "..."
    );
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error) {
    console.error(
      "[Backend Context] getUserFromHeader: Error getting user from Supabase token:",
      error.message
    );
    console.error(
      "[Backend Context] getUserFromHeader: Supabase auth error object:",
      JSON.stringify(error, null, 2)
    );
    return null;
  }

  if (!user) {
    console.log(
      "[Backend Context] getUserFromHeader: Supabase returned no error, but no user object was found for the token."
    );
    return null;
  }

  console.log(
    "[Backend Context] getUserFromHeader: Successfully retrieved user from token. User ID:",
    user.id
  );
  return user;
};

// Context creation function
export const createContext = async (opts) => {
  console.log("[Backend Context] createContext called for new request");

  const currentPrismaClient = getPrismaClient();

  console.log(
    "[Backend Context] Attempting to create Supabase client with URL:",
    supabaseUrl
  );

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  console.log("[Backend Context] Supabase client created successfully.");

  const supabaseUser = await getUserFromHeader(opts.req, supabase);
  const timestamp = Date.now();

  let prismaUser = null;
  if (supabaseUser) {
    prismaUser = await currentPrismaClient.user.findUnique({
      where: { id: supabaseUser.id },
    });
  }

  return {
    req: opts.req,
    prisma: currentPrismaClient,
    supabase,
    supabaseUser,
    prismaUser,
    timestamp,
  };
};

// Initialize tRPC
const t = initTRPC.context().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        errorCode: error.code,
        ...(isDev && { stack: error.stack }),
      },
    };
  },
});

// Create router and procedures
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

// Middleware for protected routes
const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.supabaseUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Supabase user not available. You must be logged in.",
    });
  }

  if (!ctx.prismaUser) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User profile not found in application database.",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.prismaUser,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);
