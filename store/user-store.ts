import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store'; 
import { Platform } from 'react-native';


const clearTokens = async () => {
  await SecureStore.deleteItemAsync('sessionToken');
  await SecureStore.deleteItemAsync('sessionRefreshToken');
};


export interface AppUser {
  id: string;
  name: string | null;
  email: string | null;
  isLoggedIn: boolean; 
  isPremium: boolean;
  createdAt: number;
  updatedAt: number;
  studyStats: {
    totalCardsStudied: number;
    totalTimeStudied: number;
    streakDays: number;
    lastStudyDate: number | null;
  };
  ownedDecks: string[];
  phone?: string; 
}

interface UserState {
  user: AppUser | null;
  sessionToken: string | null;
  tokenExpiry: number | null;
  isLoading: boolean;
  error: string | null;

  setSession: (userData: AppUser, accessToken: string, refreshToken?: string, expiresAt?: number) => void;
  logout: () => Promise<void>;
  updateUser: (userData: Partial<AppUser>) => void;
  updateStudyStats: (studyTime: number, cardsStudied: number) => void;
  checkAuthStatus: () => Promise<void>;
  clearError: () => void;
  shouldRefreshToken: () => boolean;
}

const defaultUserInitialState: AppUser = {
  id: 'guest-user',
  name: 'Guest User',
  email: 'guest@example.com',
  isLoggedIn: false,
  isPremium: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  studyStats: {
    totalCardsStudied: 0,
    totalTimeStudied: 0,
    streakDays: 0,
    lastStudyDate: null,
  },
  ownedDecks: [],
};

export const TOKEN_STORAGE_KEY = 'sessionToken';
export const REFRESH_TOKEN_STORAGE_KEY = 'sessionRefreshToken';

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      user: defaultUserInitialState,
      sessionToken: null,
      tokenExpiry: null,
      isLoading: false,
      error: null,

      setSession: async (userData: AppUser, accessToken: string, refreshToken?: string, expiresAt?: number) => {
        set({
          user: { ...userData, isLoggedIn: true },
          sessionToken: accessToken,
          tokenExpiry: expiresAt || null,
          isLoading: false,
          error: null
        });
        if (Platform.OS === 'web') {
          localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
          if (expiresAt) {
            localStorage.setItem('tokenExpiry', expiresAt.toString());
          }
          if (refreshToken) {
            localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
          } else {
            localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
          }
        } else {
          await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, accessToken);
          if (expiresAt) {
            await SecureStore.setItemAsync('tokenExpiry', expiresAt.toString());
          }
          if (refreshToken) {
            await SecureStore.setItemAsync(REFRESH_TOKEN_STORAGE_KEY, refreshToken);
          } else {
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
          }
        }
      },

      shouldRefreshToken: () => {
        const state = get();
        if (!state.tokenExpiry || !state.sessionToken) return false;
        
        const FIVE_MINUTES = 5 * 60 * 1000;
        return Date.now() + FIVE_MINUTES >= state.tokenExpiry;
      },

      logout: async () => {
        set({ 
          user: { ...defaultUserInitialState, isLoggedIn: false }, 
          sessionToken: null, 
          isLoading: false, 
          error: null 
        });
        if (Platform.OS === 'web') {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
        } else {
        await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
        }
      },
      
      checkAuthStatus: async () => {
        set({ isLoading: true });
        try {
          let accessToken: string | null = null;
          let refreshToken: string | null = null;

          if (Platform.OS === 'web') {
            accessToken = localStorage.getItem(TOKEN_STORAGE_KEY);
            refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
          } else {
            accessToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
            refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_STORAGE_KEY);
          }

          if (accessToken) {
            const persistedUser = get().user; 
            set({ 
              sessionToken: accessToken, 
              user: persistedUser && persistedUser.id !== 'guest-user' && persistedUser.isLoggedIn 
                    ? { ...persistedUser, isLoggedIn: true } 
                    : { ...defaultUserInitialState, isLoggedIn: true }, 
              isLoading: false 
            });
          } else {
            set({ user: defaultUserInitialState, sessionToken: null, isLoading: false });
            if (Platform.OS === 'web') {
              localStorage.removeItem(TOKEN_STORAGE_KEY);
              localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
            } else {
              await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
              await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
            }
          }
        } catch (e) {
          console.error("Failed to check auth status", e);
          set({ user: defaultUserInitialState, sessionToken: null, isLoading: false, error: 'Auth check failed' });
          if (Platform.OS === 'web') {
            localStorage.removeItem(TOKEN_STORAGE_KEY);
            localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
          } else {
            await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
            await SecureStore.deleteItemAsync(REFRESH_TOKEN_STORAGE_KEY);
          }
        }
      },

      updateUser: (userData: Partial<AppUser>) => {
        const currentUser = get().user;
        if (!currentUser) return;
        
        set(state => ({
          user: {
            ...state.user!, 
            ...userData,
            updatedAt: Date.now(),
          },
        }));
      },
      
      updateStudyStats: (studyTime: number, cardsStudied: number) => {
        const currentUser = get().user;
        if (!currentUser || !currentUser.isLoggedIn) return;

        const now = Date.now();
        let newStreakDays = currentUser.studyStats.streakDays;
        const lastStudy = currentUser.studyStats.lastStudyDate;

        if (lastStudy) {
          const oneDay = 24 * 60 * 60 * 1000;
          const diffDays = Math.round(Math.abs((now - lastStudy) / oneDay));
          if (diffDays === 1) {
            newStreakDays += 1;
          } else if (diffDays > 1) {
            newStreakDays = 1; 
          }
        } else {
          newStreakDays = 1; 
        }
        
        set(state => ({
          user: {
            ...state.user!,
            studyStats: {
              totalCardsStudied: (state.user!.studyStats.totalCardsStudied || 0) + cardsStudied,
              totalTimeStudied: (state.user!.studyStats.totalTimeStudied || 0) + studyTime,
              streakDays: newStreakDays,
              lastStudyDate: now,
            },
            updatedAt: now,
          },
        }));
      },
      clearError: () => {
        set({ error: null });
      }
    }),
    {
      name: 'flashcard-user-storage-v2', 
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ user: state.user }),
    }
  )
);