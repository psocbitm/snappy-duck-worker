# Use official Node.js LTS version as base image
FROM node:slim

# Install pnpm
RUN corepack enable

# Set working directory in container
WORKDIR /usr/src/app

# Install dependencies first (for caching)
COPY package*.json ./
RUN pnpm install --prod

# Copy the rest of the app
COPY . .

# Expose port (change if needed)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]