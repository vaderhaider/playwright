# Playwright + Node image matching your dependency version
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Environment defaults (can be overridden in Render)
ENV NODE_ENV=production \
    PORT=3000 \
    HEADLESS=true \
    SLOW_MO=50

EXPOSE 3000

# Start webhook server
CMD ["node", "webhook-server.js"]
