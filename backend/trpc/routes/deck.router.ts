import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../create-context.js';
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';

export const deckRouter = createTRPCRouter({
  listPublic: publicProcedure 
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(), 
        tags: z.array(z.string()).optional(),
        subject: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const { cursor, tags, subject } = input ?? {};
      
      const whereClause: Prisma.DeckWhereInput = {
        isPublic: true, // Ensure only public decks are listed
        AND: [],
      };

      if (tags && tags.length > 0) {
        (whereClause.AND as Prisma.DeckWhereInput[]).push({ tags: { hasSome: tags } });
      }
      if (subject) {
        (whereClause.AND as Prisma.DeckWhereInput[]).push({ subject: { contains: subject, mode: 'insensitive' } });
      }
      // If AND array is empty, it can be omitted, Prisma handles it.
      if ((whereClause.AND as Prisma.DeckWhereInput[]).length === 0) {
        delete whereClause.AND;
      }

      return ctx.prisma.deck.findMany({
        take: limit + 1, 
        cursor: cursor ? { id: cursor } : undefined,
        where: whereClause,
        include: {
          _count: {
            select: { flashcards: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    }),

  listUserDecks: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 10;
      const { cursor } = input ?? {};
      const userIdAuth = ctx.user.id; 

      return ctx.prisma.deck.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          userId: userIdAuth, 
        },
        include: {
          _count: {
            select: { flashcards: true },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    }),
  
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        tags: z.array(z.string()).optional(),
        subject: z.string().optional(),
        chapter: z.string().optional(),
        coverImage: z.string().url().optional(),
        isPremium: z.boolean().default(false),
        price: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userIdAuth = ctx.user.id; 
      return ctx.prisma.deck.create({
        data: {
          ...input,
          userId: userIdAuth, 
        },
      });
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const deck = await ctx.prisma.deck.findUnique({
        where: { id: input.id },
        include: {
          flashcards: {
            orderBy: {
              createdAt: 'asc',
            },
          },
          user: { 
            select: { id: true, name: true, email: true },
          }
        },
      });

      if (!deck) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Deck not found',
        });
      }
      return deck;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        tags: z.array(z.string()).optional().nullable(),
        subject: z.string().optional().nullable(),
        chapter: z.string().optional().nullable(),
        coverImage: z.string().url().optional().nullable(),
        isPremium: z.boolean().optional(),
        price: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tags, ...otherData } = input;
      const userIdAuth = ctx.user.id; 

      const deck = await ctx.prisma.deck.findUnique({
        where: { id },
      });

      if (!deck) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });
      }

      if (deck.userId !== userIdAuth) { 
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only update your own decks' });
      }

      const dataToUpdate: Prisma.DeckUpdateInput = { ...otherData };
      if (tags !== undefined) {
        dataToUpdate.tags = tags === null ? [] : tags;
      }

      return ctx.prisma.deck.update({
        where: { id },
        data: dataToUpdate,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userIdAuth = ctx.user.id; 
      const deck = await ctx.prisma.deck.findUnique({
        where: { id: input.id },
      });

      if (!deck) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Deck not found' });
      }

      if (deck.userId !== userIdAuth) { 
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only delete your own decks' });
      }
      
      await ctx.prisma.deck.delete({
        where: { id: input.id },
      });
      return { success: true, message: 'Deck deleted successfully' };
    }),

  studyPublicDeck: protectedProcedure
    .input(z.object({ deckId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { deckId } = input;

      // 1. Find the public deck and include its flashcards
      const publicDeck = await ctx.prisma.deck.findFirst({
        where: {
          id: deckId,
          isPublic: true,
        },
        include: {
          flashcards: { // Select only flashcard IDs to avoid overfetching
            select: { id: true }
          },
        },
      });

      if (!publicDeck) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Public deck with ID ${deckId} not found.`,
        });
      }

      if (publicDeck.flashcards.length === 0) {
        // Optional: Handle case where public deck has no flashcards
        // Could return a specific message or just proceed (will result in 0 statuses created)
        // For now, we just proceed.
      }

      // 2. Create UserFlashcardStatus entries for each flashcard in the public deck for the current user
      //    Use upsert to avoid issues if the user already has a status for some of these cards
      //    (e.g., if they are re-adding a deck or had partial progress).
      //    The `create` part will use default SRS values.
      //    The `update` part here is empty, meaning if they already have a status, we don't change it.
      //    You could modify `update` to reset progress if desired when re-adding.
      try {
        await ctx.prisma.$transaction(
          publicDeck.flashcards.map((flashcard) =>
            ctx.prisma.userFlashcardStatus.upsert({
              where: {
                userId_flashcardId: {
                  userId: userId,
                  flashcardId: flashcard.id,
                },
              },
              create: {
                userId: userId,
                flashcardId: flashcard.id,
                // SRS fields like interval, dueDate, etc., will get their default values from the schema
              },
              update: { 
                // If you want to reset progress when re-adding, you could set:
                // isDeleted: false, // Un-delete if it was soft-deleted
                // dueDate: new Date(), // Reset due date
                // interval: 1, // Reset interval
                // easeFactor: 2.5, // Reset ease factor
                // repetitions: 0, // Reset repetitions
                // isLearned: false, // Reset learned status
                // lastReviewed: null // Reset last reviewed
                // For now, we leave update empty to preserve existing progress if any.
                isDeleted: false, // Ensure it's not marked as deleted if user is re-adding
              },
            })
          )
        );
        return { success: true, message: `Deck "${publicDeck.name}" added to your study list.` };
      } catch (error) {
        console.error("Error adding public deck to user study list:", error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Could not add deck to your study list. Please try again.',
          cause: error,
        });
      }
    }),
});
