import { createTRPCRouter } from '../create-context.js';
import { adminProcedure } from '../procedures/adminProcedure';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';

export const adminRouter = createTRPCRouter({
  /**
   * Example Admin Procedure: List all users.
   * This is a placeholder and can be expanded or removed.
   */
  listUsers: adminProcedure.query(async ({ ctx }) => {
    const users = await ctx.prisma.user.findMany({
      select: { id: true, email: true, name: true, isAdmin: true, createdAt: true, updatedAt: true },
    });
    return users;
  }),

  /**
   * Simple procedure to test adminProcedure authorization.
   */
  pingAdmin: adminProcedure.query(() => {
    return "pong from admin";
  }),

  // Deck Management
  adminCreateDeck: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        isPublic: z.boolean().default(false), // Admin can set this directly
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const adminUserId = ctx.prismaUser?.id;
      if (!adminUserId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Admin user ID is required',
        });
      }
      const newDeck = await ctx.prisma.deck.create({
        data: {
          name: input.name,
          description: input.description,
          isPublic: input.isPublic,
          userId: adminUserId,
          // Other fields like 'sharedAt' or 'folderId' can be added if needed
        },
      });
      return newDeck;
    }),

  adminUpdateDeck: adminProcedure
    .input(
      z.object({
        id: z.string(), // ID of the deck to update
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        isPublic: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updatedDeck = await ctx.prisma.deck.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
          isPublic: input.isPublic,
          // lastModified: new Date(), // Consider adding a lastModified timestamp
        },
      });
      return updatedDeck;
    }),

  adminDeleteDeck: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Consider implications: what happens to flashcards in this deck?
      // Prisma by default might have cascading deletes if schema is set up that way.
      // Or, you might need to manually delete associated flashcards or handle them.
      await ctx.prisma.deck.delete({
        where: { id: input.id },
      });
      return { success: true, deletedDeckId: input.id };
    }),

  adminListDecks: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(), // Prisma cursor for pagination (deck ID)
        isPublic: z.boolean().optional(), // Optional filter by public status
        userId: z.string().optional(), // Optional filter by user ID
      }),
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 20;
      const { cursor, isPublic, userId } = input;

      const decks = await ctx.prisma.deck.findMany({
        take: limit + 1, // Fetch one extra to determine if there's a next page
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          isPublic: isPublic !== undefined ? isPublic : undefined,
          userId: userId !== undefined ? userId : undefined,
        },
        include: {
          user: { // Include user details for each deck
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          _count: { // Optionally count flashcards per deck
            select: { flashcards: true },
          },
        },
        orderBy: {
          createdAt: 'desc', // Or by name, updatedAt, etc.
        },
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (decks.length > limit) {
        const nextItem = decks.pop(); // Remove the extra item
        nextCursor = nextItem!.id; // Set the next cursor to the ID of the extra item
      }

      return {
        decks,
        nextCursor,
      };
    }),

  // Flashcard Management (Admin)
  adminCreateFlashcard: adminProcedure
    .input(
      z.object({
        deckId: z.string(),
        front: z.string().min(1),
        back: z.string().min(1),
        contentType: z.string().default('text'), // Assuming default, adjust if needed
        // mediaUrls and tags can be added here if desired for creation
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Optional: Verify the deck exists and admin has rights if not super-admin
      // For now, admin can add to any deck.
      const newFlashcard = await ctx.prisma.flashcard.create({
        data: {
          deckId: input.deckId,
          front: input.front,
          back: input.back,
          contentType: input.contentType,
          // No direct userId on Flashcard model
        },
      });
      return newFlashcard;
    }),

  adminUpdateFlashcard: adminProcedure
    .input(
      z.object({
        id: z.string(),
        front: z.string().min(1).optional(),
        back: z.string().min(1).optional(),
        deckId: z.string().optional(),
        contentType: z.string().optional(),
        // mediaUrls and tags can be added here if desired for update
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;
      const updatedFlashcard = await ctx.prisma.flashcard.update({
        where: { id },
        data: updateData,
      });
      return updatedFlashcard;
    }),

  adminDeleteFlashcard: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.flashcard.delete({
        where: { id: input.id },
      });
      return { success: true, deletedFlashcardId: input.id };
    }),

  // (Optional) manageUserRoles (e.g., grant/revoke admin)

});

export type AdminRouter = typeof adminRouter; 