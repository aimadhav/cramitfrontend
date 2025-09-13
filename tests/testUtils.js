import { vi } from 'vitest';
import { createClient as 실제SupabaseCreateClient, SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { appRouter } from '../backend/trpc/app-router'; // Adjusted path
import { createContext } from '../backend/trpc/create-context'; // Adjusted path
// Mock getUser function that we can control per test
export const mockAuthGetUser = vi.fn();
vi.mock('@supabase/supabase-js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual, // Spread actual to keep other exports like AuthError, etc.
        createClient: vi.fn((_url, _key, _options) => ({
            // This is the mock SupabaseClient instance
            auth: {
                getUser: mockAuthGetUser, // Use the single, controllable mock function here
            },
            // Add other Supabase client methods if they are used by createContext
            // e.g., rpc: vi.fn(), from: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), ...
        })),
    };
});
// Revised createCaller
export async function createCallerForTest(token) {
    const headers = new Headers();
    if (token) {
        headers.set('authorization', `Bearer ${token}`);
    }
    // Type assertion for mockReq to satisfy FetchCreateContextFnOptions['req']
    // This now explicitly matches the expected structure for a minimal request object.
    const mockReq = {
        headers,
        // Potentially other properties if your createContext depends on them, e.g., method, url
        // For now, keeping it minimal.
    };
    const mockInfo = {
        isBatchCall: false,
        type: 'query', // Can be 'query', 'mutation', or 'subscription'
        accept: 'application/jsonl', // Example, adjust if needed
        calls: [],
        connectionParams: null, // Example, adjust if needed
        signal: new AbortController().signal, // Provide a default AbortSignal
        url: new URL('http://localhost/trpc/test.path'), // Provide a dummy URL
        // Other properties like `input`, `path`, `rawInput` might be part of `calls` or context specific
    };
    // Ensure resHeaders is provided as expected by createContext
    const ctx = await createContext({ req: mockReq, resHeaders: new Headers(), info: mockInfo });
    return appRouter.createCaller(ctx);
}
