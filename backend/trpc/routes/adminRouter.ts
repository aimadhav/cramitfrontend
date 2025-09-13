import { z } from 'zod';
import { createTRPCRouter } from '../create-context.js'; // Path to your createTRPCRouter
import { adminProcedure } from '../procedures/adminProcedure.js'; // Path to your adminProcedure
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client'; // Import Prisma for error types

// Input schemas for admin deck operations
const adminCreateDeckInput = z.object({
  name: z.string().min(1, "Deck name cannot be empty."),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(), // Prisma handles optional array as undefined or string[]
  subject: z.string().optional(),    // Prisma handles optional string as undefined or string
  isPublic: z.boolean().default(false), // Admin can explicitly set isPublic
  userId: z.string().optional(), // Optional: Admin can assign to a user or it defaults to admin
});

const adminUpdateDeckInput = z.object({
  id: z.string(),
  name: z.string().min(1, "Deck name cannot be empty.").optional(),
  // For optional fields that can be cleared, Prisma expects `null` if the db field is nullable,
  // or `undefined` / not present if you don't want to change it.
  // If the field in DB is NOT nullable, you can't set it to null.
  description: z.string().nullable().optional(), // description String? -> can be set to null
  tags: z.array(z.string()).nullable().optional(), // tags String[] -> cannot be null. To clear, set to [] or undefined.
  subject: z.string().nullable().optional(),   // subject String? -> can be set to null
  isPublic: z.boolean().optional(),
  userId: z.string().optional(), // To change owner
});

export const adminRouter = createTRPCRouter({
  /**
   * Creates a new deck. Admin can set its public status and optionally assign a user.
   * If userId is not provided, it defaults to the admin's own ID.
   */
  createDeck: adminProcedure
    .input(adminCreateDeckInput)
    .mutation(async ({ ctx, input }) => {
      const userIdToAssign = input.userId || ctx.prismaUser?.id;
      try {
        return await ctx.prisma.deck.create({
          data: {
            name: input.name,
            description: input.description,
            tags: input.tags, // Prisma handles undefined here
            subject: input.subject, // Prisma handles undefined here
            isPublic: input.isPublic,
            user: { connect: { id: userIdToAssign } }, // Correct way to link user
          },
        });
      } catch (error) {
        console.error("Admin Create Deck Error:", error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create deck.',
          cause: error instanceof Error ? error : undefined,
        });
      }
    }),

  /**
   * Updates an existing deck. Admin can change any property, including ownership (userId).
   */
  updateDeck: adminProcedure
    .input(adminUpdateDeckInput)
    .mutation(async ({ ctx, input }) => {
      const { id, userId, name, description, tags, subject, isPublic } = input;

      const dataToUpdate: Prisma.DeckUpdateInput = {};

      if (name !== undefined) dataToUpdate.name = name;
      if (isPublic !== undefined) dataToUpdate.isPublic = isPublic;

      // Handle nullable fields: set to null if provided as null, otherwise include if defined
      if (description !== undefined) dataToUpdate.description = description; 
      if (subject !== undefined) dataToUpdate.subject = subject;

      // Handle 'tags': if null, set to empty array (as tags is String[] not String[]?)
      // If undefined, don't change. If array, set it.
      if (tags === null) {
        dataToUpdate.tags = { set: [] }; 
      } else if (tags !== undefined) {
        dataToUpdate.tags = { set: tags };
      }
      
      if (userId !== undefined) {
        dataToUpdate.user = { connect: { id: userId } };
      }

      if (Object.keys(dataToUpdate).length === 0) {
        // No actual data to update, could return early or let Prisma handle it.
        const currentDeck = await ctx.prisma.deck.findUnique({ where: { id } });
        if (!currentDeck) throw new TRPCError({ code: 'NOT_FOUND', message: `Deck with ID '${id}' not found.` });
        return currentDeck; // Return current deck if no changes
      }

      try {
        return await ctx.prisma.deck.update({
          where: { id },
          data: dataToUpdate,
        });
      } catch (error) {
        console.error("Admin Update Deck Error:", error);
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: `Deck with ID '${id}' not found.`,
            });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update deck.',
          cause: error instanceof Error ? error : undefined,
        });
      }
    }),

  /**
   * Lists all decks in the system. Includes user information for clarity.
   * Supports pagination.
   */
  listAllDecks: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.string().nullish(), 
      filterPublic: z.boolean().optional(),
      filterUserId: z.string().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const { cursor, filterPublic, filterUserId } = input ?? {};

      try {
        const decks = await ctx.prisma.deck.findMany({
          take: limit + 1, 
          cursor: cursor ? { id: cursor } : undefined,
          where: {
            ...(filterPublic !== undefined && { isPublic: filterPublic }),
            ...(filterUserId && { userId: filterUserId }),
          },
          orderBy: { createdAt: 'desc' }, 
          include: { user: { select: { id: true, email: true, name: true } } },
        });

        let nextCursor: typeof cursor | undefined = undefined;
        if (decks.length > limit) {
          const nextItem = decks.pop(); 
          nextCursor = nextItem!.id; 
        }
        return {
          decks,
          nextCursor,
        };
      } catch (error) {
        console.error("Admin List All Decks Error:", error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list decks.',
          cause: error instanceof Error ? error : undefined,
        });
      }
    }),
  
  // TODO: Add more admin procedures as needed

  /**
   * Lists all users in the system.
   * Supports pagination.
   */
  listUsers: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.string().nullish(), // Assuming User ID is a string
      // Add other filters if needed, e.g., filter by email, name, isAdmin status
      filterIsAdmin: z.boolean().optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const { cursor, filterIsAdmin } = input ?? {};

      try {
        const users = await ctx.prisma.user.findMany({
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          where: {
            ...(filterIsAdmin !== undefined && { isAdmin: filterIsAdmin }),
          },
          select: {
            id: true,
            email: true,
            name: true,
            isAdmin: true,
            createdAt: true,
            updatedAt: true,
            // Avoid selecting sensitive fields like passwordHash if it exists
          },
          orderBy: { createdAt: 'desc' },
        });

        let nextCursor: typeof cursor | undefined = undefined;
        if (users.length > limit) {
          const nextItem = users.pop();
          nextCursor = nextItem!.id;
        }
        return {
          users,
          nextCursor,
        };
      } catch (error) {
        console.error("Admin List Users Error:", error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to list users.',
          cause: error instanceof Error ? error : undefined,
        });
      }
    }),

  /**
   * Sets the admin status for a specific user.
   */
  setUserAdminStatus: adminProcedure
    .input(z.object({
      userId: z.string(),
      isAdmin: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { userId, isAdmin } = input;

      // Basic check: Prevent admin from removing their own admin status if they are the one making the call.
      // A more robust solution would check if they are the *only* admin.
      if (ctx.prismaUser?.id === userId && !isAdmin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Admin cannot remove their own admin status through this endpoint.',
        });
      }

      try {
        const userToUpdate = await ctx.prisma.user.findUnique({
          where: { id: userId },
        });

        if (!userToUpdate) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `User with ID '${userId}' not found.`,
          });
        }

        return await ctx.prisma.user.update({
          where: { id: userId },
          data: { isAdmin },
          select: { // Return minimal, relevant data
            id: true,
            email: true,
            isAdmin: true,
          }
        });
      } catch (error) {
        console.error("Admin Set User Admin Status Error:", error);
        if (error instanceof TRPCError) throw error; // Re-throw TRPCError directly
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
             throw new TRPCError({
                code: 'NOT_FOUND',
                message: `User with ID '${userId}' not found (P2025).`,
            });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update user admin status.',
          cause: error instanceof Error ? error : undefined,
        });
      }
    }),
});
