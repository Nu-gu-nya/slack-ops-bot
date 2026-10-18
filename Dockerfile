# Build stage: needs devDependencies (TypeScript) to compile.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Runtime stage: production dependencies and compiled output only, which keeps
# the image small and leaves compilers out of what runs in production.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist

# The bot needs no privileges; the base image ships an unprivileged "node" user.
USER node

# Configuration comes from the platform's environment variables, not a .env file.
# No port is exposed: Socket Mode only makes outbound connections (ADR-002).
CMD ["node", "dist/bot/app.js"]
