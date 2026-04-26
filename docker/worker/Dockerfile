FROM node:20-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY worker/package*.json ./worker/

# Install dependencies
RUN npm install

# Copy worker source
COPY worker/ ./worker/

WORKDIR /app/worker

# Build TypeScript
RUN npm run build

# Create directories
RUN mkdir -p /app/uploads /app/outputs

CMD ["npm", "start"]
