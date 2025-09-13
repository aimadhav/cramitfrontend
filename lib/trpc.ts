import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
// import type { AppRouter } from "@/backend/trpc/app-router";
import Constants from "expo-constants";
import { Platform } from "react-native";
import * as SecureStore from 'expo-secure-store';
// superjson is not currently used, can be commented or removed if not planned for re-addition
// import superjson from 'superjson';

export const trpc = createTRPCReact<any>();

const getBaseUrl = () => {
  // Get the localhost URL for the appropriate platform
  const localhost = Platform.OS === "android" ? "10.0.2.2" : "localhost";

  // Default development URL (will be overridden by env vars if present)
  let urlToUse = `http://${localhost}:8081`;

  // Check for Expo environment variables first
  if (process.env.EXPO_PUBLIC_API_URL) {
    urlToUse = process.env.EXPO_PUBLIC_API_URL;
    console.log('[TRPC Client] Using EXPO_PUBLIC_API_URL:', urlToUse);
  } else if (Constants.expoConfig?.extra?.apiUrl) { // For development in Expo Go via app.json extra
    urlToUse = Constants.expoConfig.extra.apiUrl;
    console.warn("getBaseUrl in utils/trpc.ts is using localhost for native. This will likely fail. Replace with your machine's local IP address or ngrok URL for native development.");
  }

  console.log('[TRPC Client] Using base URL for API calls:', urlToUse); // Added for debugging
  return urlToUse;
};

// Basic identity transformer for standard JSON behavior
const identityTransformer = {
  serialize: (object: any) => object,
  deserialize: (object: any) => object,
};

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
      async headers() {
        console.log('[TRPC Headers] Attempting to retrieve auth token from SecureStore for httpBatchLink...');
        let token: string | null = null;
        try {
          if (!SecureStore) {
            console.error("[TRPC Headers] SecureStore module is undefined!");
            return {};
          }
          if (typeof SecureStore.getItemAsync !== 'function') {
            console.error("[TRPC Headers] SecureStore.getItemAsync is not a function!");
            return {};
          }
          
          token = await SecureStore.getItemAsync('sessionToken'); 
          console.log("[TRPC Headers] SecureStore.getItemAsync call completed. Token:", token ? 'exists' : 'null_or_empty');

          if (token) {
            console.log("[TRPC Headers] Token found, adding Authorization header.");
            return {
              Authorization: `Bearer ${token}`,
            };
          }
          console.log("[TRPC Headers] No token found, returning empty headers.");
          return {};
        } catch (e: any) {
          console.error("[TRPC Headers] Error during SecureStore.getItemAsync or header construction:", e.message, e.stack);
          return {}; // Return empty headers on error
        }
      },
    }),
  ],
  // transformer: superjson, // Superjson can be added back if date/complex type issues arise
});