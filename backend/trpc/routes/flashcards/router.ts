import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '../../create-context.js';
import { TRPCError } from '@trpc/server';

const createFlashcardInput = z.object({
  deckId: z.string(),
  front: z.string().min(1, "Front content cannot be empty"),
  back: z.string().min(1, "Back content cannot be empty"),
  contentType: z.string().optional().default('text'),
  mediaUrls: z.array(z.string().url("Invalid URL format")).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

const updateUserFlashcardStatusInput = z.object({
  flashcardId: z.string(),
  interval: z.number().int().positive().optional(),
  easeFactor: z.number().positive().optional(),
  repetitions: z.number().int().nonnegative().optional(),
  dueDate: z.string().datetime({ offset: true, precision: 3 }).optional(),
  lastReviewed: z.string().datetime({ offset: true, precision: 3 }).optional(),
  isBookmarked: z.boolean().optional(),
  isLearned: z.boolean().optional(),
});

const updateFlashcardContentInput = z.object({
  flashcardId: z.string(), // ID of the flashcard to update (could be original or already a copy)
  front: z.string().min(1, "Front content cannot be empty").optional(),
  back: z.string().min(1, "Back content cannot be empty").optional(),
  contentType: z.string().optional(),
  mediaUrls: z.array(z.string().url("Invalid URL format")).optional(),
  tags: z.array(z.string()).optional(),
  targetDeckId: z.string().optional(), // Optional: if user wants to copy to a specific existing personal deck
});

export const flashcardRouter = createTRPCRouter({
  create: protectedProcedure
    .input(createFlashcardInput)
    .mutation(async ({ ctx, input }) => {
      const { deckId, front, back, contentType, mediaUrls, tags } = input;
      const userId = ctx.user.id;

      // 1. Verify deck ownership
      const deck = await ctx.prisma.deck.findUnique({
        where: { id: deckId },
      });

      if (!deck) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Deck with ID ${deckId} not found.`,
        });
      }

      if (deck.userId !== userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to add flashcards to this deck.',
        });
      }

      // 2. Create Flashcard and UserFlashcardStatus in a transaction
      try {
        const newFlashcardAndStatus = await ctx.prisma.$transaction(async (prisma) => {
          const newFlashcard = await prisma.flashcard.create({
            data: {
              deckId,
              front,
              back,
              contentType,
              mediaUrls,
              tags,
            },
          });

          const newUserFlashcardStatus = await prisma.userFlashcardStatus.create({
            data: {
              userId,
              flashcardId: newFlashcard.id,
              // SRS fields will use default values from schema
              // isBookmarked, isLearned, isDeleted will also use defaults
            },
          });

          return { ...newFlashcard, userStatus: newUserFlashcardStatus }; // Return combined result
        });

        return newFlashcardAndStatus;
      } catch (error) {
        console.error("Error creating flashcard and status:", error);
        // Check if it's a known Prisma error or a general error
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create flashcard. Please try again.',
          cause: error,
        });
      }
    }),

  updateUserStatus: protectedProcedure
    .input(updateUserFlashcardStatusInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { flashcardId, ...updateDataRest } = input;

      // Manual date string to Date object conversion for Prisma
      const updateDataForPrisma: any = { ...updateDataRest };
      if (updateDataRest.dueDate) {
        updateDataForPrisma.dueDate = new Date(updateDataRest.dueDate);
      }
      if (updateDataRest.lastReviewed) {
        updateDataForPrisma.lastReviewed = new Date(updateDataRest.lastReviewed);
      }
      // Remove original string dates if they exist to avoid passing them to Prisma if not converted
      // (though spread syntax above should handle it if keys match)
      // delete updateDataForPrisma.dueDate; 
      // delete updateDataForPrisma.lastReviewed;

      // Check if there's anything to update after potential date conversions
      // This check might need refinement if only dates were present and converted
      if (Object.keys(updateDataForPrisma).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No update data provided.',
        });
      }

      const existingStatus = await ctx.prisma.userFlashcardStatus.findUnique({
        where: {
          userId_flashcardId: {
            userId,
            flashcardId,
          },
        },
      });

      if (!existingStatus) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Status for flashcard ID ${flashcardId} not found for this user. Please ensure the flashcard exists and you have interacted with it.`, 
        });
      }

      try {
        const updatedStatus = await ctx.prisma.userFlashcardStatus.update({
          where: {
            id: existingStatus.id,
          },
          data: updateDataForPrisma, // Use the data with Date objects
        });
        return updatedStatus;
      } catch (error) {
        console.error("Error updating user flashcard status:", error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to update flashcard status.',
          cause: error,
        });
      }
    }),

  listByDeck: publicProcedure
    .input(
      z.object({
        deckId: z.string(),
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(), // Assuming flashcard IDs are CUIDs (strings)
        tags: z.array(z.string()).optional(), // For filtering flashcards by tags
      })
    )
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 10;
      const { deckId, cursor, tags } = input;

      // Check if the deck exists first
      const deck = await ctx.prisma.deck.findUnique({
        where: { id: deckId },
      });

      if (!deck) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Deck with ID ${deckId} not found.`,
        });
      }

      const flashcards = await ctx.prisma.flashcard.findMany({
        take: limit + 1, // Fetch one more to determine if there's a next page
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          deckId: deckId,
          AND: [
            tags && tags.length > 0 ? { tags: { hasSome: tags } } : {},
          ],
        },
        orderBy: {
          createdAt: 'asc',
        },
        // TODO: Later, if user is logged in, fetch and merge UserFlashcardStatus
      });

      let nextCursor: typeof cursor | undefined = undefined;
      if (flashcards.length > limit) {
        const nextItem = flashcards.pop(); // Remove the extra item
        nextCursor = nextItem!.id; // Use its ID as the next cursor
      }

      // If user is logged in, fetch their statuses for these cards
      // This is a simplified example; for production, you might want to do this more efficiently
      let flashcardsWithStatus = flashcards as Array<typeof flashcards[0] & { userStatus?: any }>;
      if (ctx.prismaUser) {
        const flashcardIds = flashcards.map(fc => fc.id);
        const statuses = await ctx.prisma.userFlashcardStatus.findMany({
          where: {
            userId: ctx.prismaUser.id,
            flashcardId: { in: flashcardIds },
            isDeleted: false, // Only include non-deleted statuses
          },
        });
        
        const statusMap = new Map(statuses.map(s => [s.flashcardId, s]));
        flashcardsWithStatus = flashcards.map(fc => ({
          ...fc,
          userStatus: statusMap.get(fc.id),
        }));
      }

      return {
        items: flashcardsWithStatus,
        nextCursor,
      };
    }),
  
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const card = await ctx.prisma.flashcard.findUnique({
        where: { id: input.id },
        // No include here, we will fetch status separately if user is logged in
      });

      if (!card) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Flashcard with ID ${input.id} not found`,
        });
      }

      let userStatus: any | undefined = undefined; // Define userStatus outside
      if (ctx.prismaUser) {
        // If user is authenticated, try to fetch their specific status for this card
        console.log(`[RouterLog] getById: Attempting to find UserFlashcardStatus for userId: ${ctx.prismaUser.id}, flashcardId: ${card.id}, isDeleted: false`);
        userStatus = await ctx.prisma.userFlashcardStatus.findUnique({
          where: {
            userId_flashcardId: { userId: ctx.prismaUser.id, flashcardId: card.id },
            isDeleted: false, // Ensure we only get active statuses
          },
        });
        console.log(`[RouterLog] getById: Found UserFlashcardStatus:`, JSON.stringify(userStatus));
      }

      return { ...card, userStatus: userStatus || undefined };
    }),

  getDueFlashcardsForUser: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.user.id;
      const now = new Date();

      const dueFlashcardStatuses = await ctx.prisma.userFlashcardStatus.findMany({
        where: {
          userId: userId,
          dueDate: {
            lte: now, // Less than or equal to current time
          },
          isDeleted: false, // Ensure the card is not soft-deleted by the user
        },
        include: {
          flashcard: true, // Include the actual flashcard data
        },
        orderBy: {
          dueDate: 'asc', // Oldest due dates first
        },
      });

      // We can directly return this array. The frontend can then access flashcard details via `status.flashcard`.
      return dueFlashcardStatuses;
    }),

  updateContent: protectedProcedure
    .input(updateFlashcardContentInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { flashcardId, front, back, contentType, mediaUrls, tags, targetDeckId } = input;

      const updateData: {
        front?: string;
        back?: string;
        contentType?: string;
        mediaUrls?: string[];
        tags?: string[];
      } = {};
      if (front !== undefined) updateData.front = front;
      if (back !== undefined) updateData.back = back;
      if (contentType !== undefined) updateData.contentType = contentType;
      if (mediaUrls !== undefined) updateData.mediaUrls = mediaUrls;
      if (tags !== undefined) updateData.tags = tags;

      if (Object.keys(updateData).length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No content updates provided.',
        });
      }

      const originalFlashcard = await ctx.prisma.flashcard.findUnique({
        where: { id: flashcardId },
        include: { deck: true }, // Include deck to check ownership and public status
      });

      if (!originalFlashcard) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flashcard not found.' });
      }

      const isOwnCard = originalFlashcard.deck.userId === userId;

      if (isOwnCard) {
        // User is updating their own flashcard directly
        const updatedFlashcard = await ctx.prisma.flashcard.update({
          where: { id: flashcardId },
          data: updateData,
        });
        // If user is logged in, also fetch their status for this card
        const status = await ctx.prisma.userFlashcardStatus.findUnique({
            where: { userId_flashcardId: { userId, flashcardId: updatedFlashcard.id }, isDeleted: false }
        });
        return { ...updatedFlashcard, userStatus: status };

      } else if (originalFlashcard.deck.isPublic) {
        // Card is from a public deck not owned by the user - trigger copy-on-edit
        
        // 1. Get existing UserFlashcardStatus for the original card (to potentially copy SRS data)
        const existingStatus = await ctx.prisma.userFlashcardStatus.findUnique({
          where: { userId_flashcardId: { userId, flashcardId }, isDeleted: false }, // Only consider active statuses
        });

        // If targetDeckId is provided, verify ownership first, regardless of existingStatus
        if (targetDeckId) {
          const userOwnsTargetDeck = await ctx.prisma.deck.findFirst({
            where: { id: targetDeckId, userId },
          });
          if (!userOwnsTargetDeck) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Target deck not found or not owned by user.', // Corrected message based on test
            });
          }
        }

        return ctx.prisma.$transaction(async (prisma) => {
          // 2. Determine target deck for the new copy
          let finalTargetDeckId = targetDeckId;
          if (!finalTargetDeckId) {
            const personalCopyDeckName = `Personal Copy of ${originalFlashcard.deck.name}`;
            let personalDeck = await prisma.deck.findFirst({
              where: { userId, name: personalCopyDeckName },
            });
            if (!personalDeck) {
              personalDeck = await prisma.deck.create({
                data: {
                  userId,
                  name: personalCopyDeckName,
                  description: `Personal copy of the public deck: ${originalFlashcard.deck.name}`,
                  isPublic: false,
                },
              });
            }
            finalTargetDeckId = personalDeck.id;
          } 
          // No else needed here for targetDeckId ownership, already checked above
          
          const newCopiedFlashcard = await prisma.flashcard.create({
            data: {
              front: updateData.front ?? originalFlashcard.front,
              back: updateData.back ?? originalFlashcard.back,
              contentType: updateData.contentType ?? originalFlashcard.contentType,
              mediaUrls: updateData.mediaUrls ?? originalFlashcard.mediaUrls,
              tags: updateData.tags ?? originalFlashcard.tags,
              deckId: finalTargetDeckId!,
            },
          });

          // 4. Create new UserFlashcardStatus for the copied card.
          // If user was actively studying original, copy SRS data. Otherwise, new default status.
          const newStatusData: any = {
            userId,
            flashcardId: newCopiedFlashcard.id,
            isDeleted: false,
          };

          if (existingStatus) { // User was actively studying the original card
            newStatusData.interval = existingStatus.interval;
            newStatusData.easeFactor = existingStatus.easeFactor;
            newStatusData.repetitions = existingStatus.repetitions;
            newStatusData.dueDate = existingStatus.dueDate; 
            newStatusData.lastReviewed = existingStatus.lastReviewed;
            newStatusData.isBookmarked = existingStatus.isBookmarked;
            newStatusData.isLearned = existingStatus.isLearned;
          }
          // If no existingStatus, fields will take default values from Prisma schema.

          const newStatus = await prisma.userFlashcardStatus.create({ data: newStatusData });

          // 5. Soft delete the old UserFlashcardStatus for the original public card IF it existed
          if (existingStatus) {
            await prisma.userFlashcardStatus.update({
              where: { id: existingStatus.id },
              data: { isDeleted: true }, 
            });
          }

          return { ...newCopiedFlashcard, userStatus: newStatus };
        });
      } else {
        // Card is not owned by user and deck is not public - this case should ideally not happen
        // if a user only gets to interact with their own cards or public cards.
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to edit this flashcard.',
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ flashcardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { flashcardId } = input;

      const flashcard = await ctx.prisma.flashcard.findUnique({
        where: { id: flashcardId },
        include: {
          deck: true, // To check deck ownership and public status
        },
      });

      if (!flashcard) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Flashcard not found.' });
      }

      // Case 1: User owns the deck this flashcard is in (it's their own card/copy)
      if (flashcard.deck.userId === userId) {
        // Hard delete the flashcard. Associated UserFlashcardStatus records will be cascade deleted.
        await ctx.prisma.flashcard.delete({
          where: { id: flashcardId },
        });
        return { success: true, message: 'Flashcard deleted successfully.' };
      }
      
      // Case 2: User does not own the deck, but deck is public
      // This means user might be studying it. We soft-delete their UserFlashcardStatus.
      if (flashcard.deck.isPublic) {
        const userStatus = await ctx.prisma.userFlashcardStatus.findUnique({
          where: {
            userId_flashcardId: {
              userId,
              flashcardId,
            },
          },
        });

        if (userStatus && !userStatus.isDeleted) {
          await ctx.prisma.userFlashcardStatus.update({
            where: { id: userStatus.id },
            data: { isDeleted: true },
          });
          return { success: true, message: 'Flashcard removed from your study list.' };
        } else if (userStatus && userStatus.isDeleted) {
          // Already soft-deleted by this user, no action needed or inform user?
          return { success: true, message: 'Flashcard already removed from your study list.' };
        } else {
          // User doesn't have a status for this public card, so they can't "delete" it from their list.
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'You are not studying this public flashcard and cannot remove it.',
          });
        }
      }

      // Case 3: User does not own the deck, and the deck is not public.
      // Or any other scenario where they shouldn't be able to delete.
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to delete this flashcard.',
      });
    }),
});