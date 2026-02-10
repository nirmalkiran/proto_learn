FROM node:18-slim
WORKDIR /app
COPY package.json ./
COPY mobile-agent.js ./
COPY README.md ./
RUN npm install --production
ENV NODE_ENV=production
CMD ["node", "mobile-agent.js"]
