import { z } from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../../create-context.js";
import { TRPCError } from "@trpc/server";

export const authRouter = createTRPCRouter({
  signup: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(6, "Password must be at least 6 characters long"),
        name: z.string().optional(), // Optional name field
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { email, password, name } = input;

      // 1. Sign up user with Supabase Auth
      const { data: authData, error: authError } = await ctx.supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: authError.message || "Failed to sign up user with Supabase Auth.",
        });
      }

      if (!authData.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Supabase Auth did not return a user on signup.",
        });
      }

      // 2. Create user in your Prisma database
      try {
        const appUser = await ctx.prisma.user.create({
          data: {
            id: authData.user.id, // Use Supabase user ID as your app's user ID
            email: authData.user.email!, // email is guaranteed by Supabase user object
            name: name, // Store the optional name
            // Add any other default fields for your User model here
          },
        });
        return {
          message: "Signup successful! Please check your email to confirm.", // Supabase usually sends a confirmation email
          user: {
            id: appUser.id,
            email: appUser.email,
            name: appUser.name,
          },
          supabaseUser: authData.user, // You might not need to return this whole object
        };
      } catch (prismaError: any) {
        // Handle potential Prisma errors, e.g., if user already exists by ID (shouldn't happen if Supabase ID is unique)
        // Or if email constraint is violated (also less likely if Supabase handles it first)
        // For now, a generic error. In production, you might want to clean up the Supabase user if Prisma creation fails.
        console.error("Prisma user creation error:", prismaError);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user record in application database.",
          cause: prismaError,
        });
      }
    }),

  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { email, password } = input;
      const { data, error } = await ctx.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: error.message || "Login failed.",
        });
      }
      
      if (!data.session || !data.user) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Login did not return session or user.",
        });
      }

      // Fetch the user from Prisma DB to get the complete user data
      const appUser = await ctx.prisma.user.findUnique({ 
        where: { id: data.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!appUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "User not found in application database.",
        });
      }

      // Calculate token expiration time
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : null;

      return {
        message: "Login successful!",
        session: {
          ...data.session,
          expires_at: expiresAt,
        },
        user: {
          ...data.user,
          name: appUser.name,
        },
      };
    }),

  refreshSession: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!input.refreshToken) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Refresh token is required.",
        });
      }
      const { data, error } = await ctx.supabase.auth.refreshSession({ 
        refresh_token: input.refreshToken 
      });

      if (error) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: error.message || "Failed to refresh session.",
          cause: error,
        });
      }
      
      if (!data.session || !data.user) {
        throw new TRPCError({
          code: "UNAUTHORIZED", 
          message: "Failed to refresh session: No session or user returned. Refresh token may be invalid.",
        });
      }

      // Calculate token expiration time
      const expiresAt = data.session.expires_at ? data.session.expires_at * 1000 : null;

      return {
        message: "Session refreshed successfully!",
        session: {
          ...data.session,
          expires_at: expiresAt,
        },
        user: data.user,
      };
    }),

  // Optional: A protected route to get the current user's info
  me: protectedProcedure
    .query(async ({ ctx }) => {
      // Fetch the complete user data from Prisma
      const appUser = await ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true,
        }
      });

      if (!appUser) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "User not found in application database.",
        });
      }

      return appUser;
    }),
  
  // Optional: Logout (invalidates Supabase session on the client, server doesn't do much here for stateless JWTs)
  logout: protectedProcedure
    .mutation(async ({ ctx }) => {
      const { error } = await ctx.supabase.auth.signOut(); // This primarily affects client-side SDK state
      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error.message || 'Failed to sign out.',
        });
      }
      return { message: 'Successfully signed out' };
    }),
});
