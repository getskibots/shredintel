# Playwright's official image ships Chromium + every system dependency it needs,
# so the droplet needs nothing but Docker. Pin the image to the playwright
# version in package.json so the bundled browser matches.
FROM mcr.microsoft.com/playwright:v1.49.0-jammy

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
