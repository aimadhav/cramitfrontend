# CramIt - Flashcard Learning App

A React Native flashcard application with spaced repetition learning.

## Architecture

This project uses a **separated frontend and backend architecture**:

- **Frontend**: React Native app with Expo
- **Backend**: Node.js server with Hono and tRPC
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Supabase Auth

## Quick Start

### 1. Start the Backend

```bash
cd backend
npm install
npm run dev
```

The backend will start on `http://localhost:8081`

### 2. Start the Frontend

```bash
# In the root directory
npm install
npm start
```

### 3. Environment Setup

Create a `.env` file in the root directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_API_URL=http://localhost:8081
```

## Development

### Frontend Development
- Uses Expo Router for navigation
- tRPC client for type-safe API calls
- Zustand for state management
- NativeWind for styling

### Backend Development
- Hono server with tRPC integration
- Prisma for database operations
- Supabase for authentication
- Separate package.json and TypeScript config

## Important Notes

- **Never import backend runtime code in the frontend**
- All backend imports should be type-only: `import type { AppRouter } from '../backend/trpc/app-router'`
- The backend runs as a separate Node.js process
- Environment checks prevent accidental execution in non-Node environments

## Testing

```bash
npm test
```

## Building

### Frontend
```bash
npm run build
```

### Backend
```bash
cd backend
npm run build
```
