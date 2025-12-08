FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy contract sources and scripts
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
COPY hardhat.config.js ./

# Compile contracts
RUN npx hardhat compile

# Copy entrypoint
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 8545

ENTRYPOINT ["./entrypoint.sh"]
