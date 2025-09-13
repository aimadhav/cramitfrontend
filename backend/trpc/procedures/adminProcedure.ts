import { TRPCError } from '@trpc/server';
import { protectedProcedure } from '../create-context.js'; // Corrected path

/**
 * Middleware to check if the authenticated Prisma user is an administrator.
 * It relies on `protectedProcedure` to first ensure the user is logged in
 * and their `supabaseUser` and `prismaUser` (with `isAdmin` field) are attached to the context.
 */
export const adminProcedure = protectedProcedure.use(async (opts) => {
  const { ctx } = opts;

  // protectedProcedure already ensures ctx.prismaUser is not null.
  // We also know from schema changes that prismaUser has an `isAdmin` property.
  if (!ctx.prismaUser?.isAdmin) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Administrator access required. You do not have permission to perform this action.',
    });
  }

  // If the user is an admin, proceed with the next middleware or resolver
  return opts.next({
    ctx: {
      ...ctx,
      // supabaseUser and prismaUser are already correctly typed and non-null from protectedProcedure
    },
  });
});

