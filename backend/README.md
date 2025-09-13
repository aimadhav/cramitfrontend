# CramIt Backend

This is the backend server for the CramIt flashcard application. It runs as a separate Node.js process and should not be bundled with the frontend.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (create a `.env` file):
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
DATABASE_URL=your_database_url
```

3. Run database migrations:
```bash
npx prisma migrate dev
```

## Development

Start the development server:
```bash
npm run dev
```

The server will start on port 8081 by default.

## Production

Build the application:
```bash
npm run build
```

Start the production server:
```bash
npm run start:prod
```

## Architecture

- **hono.ts**: Main server entry point
- **trpc/**: tRPC router and procedures
- **prisma/**: Database client and schema
- **create-context.ts**: Request context creation with authentication

## Important Notes

- This backend runs independently of the frontend
- The frontend connects via HTTP to the backend API
- Environment checks prevent accidental execution in non-Node environments
- All imports from this backend should be type-only in the frontend 