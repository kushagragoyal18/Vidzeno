FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install

# Copy backend source
COPY backend/ ./backend/

WORKDIR /app/backend

# Build TypeScript
RUN npm run build

# Create upload/output directories
RUN mkdir -p /app/uploads /app/outputs

EXPOSE 3001

CMD ["npm", "start"]
