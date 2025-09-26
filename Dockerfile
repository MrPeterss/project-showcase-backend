# Use the official Node.js 18 image as base
FROM node:24-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Copy firebase service account
COPY firebase-service-account.json ./firebase-service-account.json

# Install dependencies
RUN npm ci

# Copy prisma schema first
COPY prisma ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy TypeScript configuration
COPY tsconfig.json ./

# Copy source code
COPY src ./src/

# Build the TypeScript application
RUN npm run build

# Create a directory for the SQLite database
RUN mkdir -p /app/data

# Start the application
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
