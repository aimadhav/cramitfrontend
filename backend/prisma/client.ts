import { PrismaClient } from '@prisma/client';

// Enhance global type to include prisma
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  console.log(`[Prisma Client] Creating new PrismaClient instance. NODE_ENV: ${process.env.NODE_ENV}`);
  return new PrismaClient({
    log: (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
      ? ["query", "error", "warn"]
      : ["error"],
  });
};

// Ensure type safety for globalThis.prisma
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

console.log("[Prisma Client] Existing global prisma instance:", globalThis.prisma ? "YES ✅" : "NO ❌");

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export const getPrismaClient = () => {
  // console.log(`[getPrismaClient] Returning Prisma instance. globalThis.prisma exists: ${!!globalForPrisma.prisma}`);
  return prisma;
}

if (process.env.NODE_ENV !== 'production') {
  // console.log("[Prisma Client] Development mode: Storing Prisma instance on globalThis.");
  globalForPrisma.prisma = prisma;
}


// Exported only for testing purposes to allow full reset
export const _TEST_ONLY_disconnectAndResetPrismaClient = async () => {
  if (prisma) { // Check the module-level prisma which is the global one now
    console.log('[_TEST_ONLY_disconnectAndResetPrismaClient] Disconnecting PrismaClient instance.');
    await prisma.$disconnect();
    console.log('[_TEST_ONLY_disconnectAndResetPrismaClient] Disconnected PrismaClient instance.');
  }
  if (globalForPrisma.prisma) {
     await globalForPrisma.prisma.$disconnect(); // Also ensure global one is disconnected if different
     globalForPrisma.prisma = undefined; 
     console.log('[_TEST_ONLY_disconnectAndResetPrismaClient] globalThis.prisma set to undefined.');
  }
  // No module-level 'prisma' variable to set to null anymore in the same way as before,
  // as 'prisma' const is now initialized from global or singleton function.
  // The critical part is setting globalForPrisma.prisma to undefined.
}; 