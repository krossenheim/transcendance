#!/bin/sh
set -e

echo "Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 &
HARDHAT_PID=$!

echo "Waiting for Hardhat node to be ready..."
sleep 5

echo "Deploying TournamentScores contract..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy_with_key.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT"

CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)
PRIVATE_KEY=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

if [ -n "$CONTRACT_ADDRESS" ]; then
    echo "=============================================="
    echo "CONTRACT DEPLOYED SUCCESSFULLY"
    echo "Contract Address: $CONTRACT_ADDRESS"
    echo "Deployer Private Key: $PRIVATE_KEY"
    echo "=============================================="
    echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > /app/deployed.env
    echo "DEPLOYER_PRIVATE_KEY=$PRIVATE_KEY" >> /app/deployed.env
else
    echo "WARNING: Could not extract contract address from deployment output"
fi

echo "Hardhat node running on port 8545..."

wait $HARDHAT_PID
