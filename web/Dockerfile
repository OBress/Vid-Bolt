# =============================================================================
# Vid-Bolt Production Dockerfile
# =============================================================================
# Includes yt-dlp and FFmpeg for video processing.
# =============================================================================

FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    && pip3 install yt-dlp --break-system-packages

# Verify installations
RUN yt-dlp --version && ffmpeg -version

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install Node dependencies (use legacy-peer-deps for remotion compatibility)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build argument to control production vs dev build
ARG BUILD_ENV=production

# Build for production (skip in dev mode)
RUN if [ "$BUILD_ENV" = "production" ]; then npm run build; fi

# Expose port
EXPOSE 3000

# Default command (overridden by docker-compose for dev)
CMD ["npm", "start"]
