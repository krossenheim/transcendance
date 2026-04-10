FROM node:24.8-slim

WORKDIR /app

RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
COPY hardhat.config.ts ./

RUN npx hardhat build

COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8545

ENTRYPOINT ["./entrypoint.sh"]
