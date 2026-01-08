# WISPR Self-Hosted Agent Docker Image
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy agent script
COPY agent.js ./
COPY README.md ./

# Set default environment variables
ENV HEADLESS=true
ENV NODE_ENV=production

# Run the agent
CMD ["npm", "start"]
