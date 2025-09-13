FROM node:20-alpine AS base
WORKDIR /app

# 1) Install production deps for final image
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2) Build TypeScript and generate Prisma client with dev deps available
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npx prisma generate

# 3) Final runtime image (no dev deps)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Overwrite with generated Prisma artifacts from build stage
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# App build output and prisma schema
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./package.json

EXPOSE 8081
CMD ["node", "dist/server.js"]



