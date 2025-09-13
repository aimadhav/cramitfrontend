import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
// import type { createContext } from '../../../backend/trpc/create-context';
// import type { appRouter } from '../../../backend/trpc/app-router';
import { NextRequest, NextResponse } from 'next/server';

// Dynamic imports to avoid bundling backend code in frontend
const getBackendModules = async () => {
  // const { createContext: createContextFn } = await import('../../../backend/trpc/create-context');
// const { appRouter: router } = await import('../../../backend/trpc/app-router');
  return { createContext: createContextFn, appRouter: router };
};

const handler = async (req: NextRequest) => {
  console.log(`[TRPC API Handler] Received ${req.method} request for ${req.url}`);

  // Handle CORS preflight (OPTIONS) requests
  if (req.method === 'OPTIONS') {
    console.log('[TRPC API Handler] Responding to OPTIONS request with CORS headers.');
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', '*'); // Adjust as needed for security
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-TRPC-Method'); // Add any other headers your client might send
    response.headers.set('Access-Control-Max-Age', '86400'); // Optional: cache preflight response
    return response;
  }

  /*
  if (req.method === 'POST') {
    try {
      // Clone the request to read its body for logging 
      // without consuming the original request's body stream.
      const reqCloneForLogging = req.clone();
      const bodyText = await reqCloneForLogging.text();
      console.log('[TRPC API Handler] Raw POST body (read from cloned request for logging):', bodyText);
    } catch (e) {
      console.error('[TRPC API Handler] Error reading POST body for logging:', e);
    }
  }
  */

  // Dynamically import backend modules
  const { createContext, appRouter } = await getBackendModules();

  // The original 'req' object's body should still be available here for fetchRequestHandler
  return fetchRequestHandler({
    endpoint: '/api/trpc',
    req, // Pass the original request object
    router: appRouter,
    createContext: createContext,
    onError:
      process.env.NODE_ENV === 'development'
        ? ({ path, error }) => {
            console.error(
              `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`,
              error,
            );
          }
        : undefined,
  });
};

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH, handler as OPTIONS };
