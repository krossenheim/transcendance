#!/bin/sh
set -e

# Start Hardhat node in the background
echo "Starting Hardhat node..."
npx hardhat node --hostname 0.0.0.0 &
HARDHAT_PID=$!

# Wait for the node to be ready
echo "Waiting for Hardhat node to be ready..."
sleep 5

# Deploy the contract
echo "Deploying TournamentScores contract..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy_with_key.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract contract address and private key from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{40}' | head -1)
PRIVATE_KEY=$(echo "$DEPLOY_OUTPUT" | grep -oE '0x[a-fA-F0-9]{64}' | head -1)

if [ -n "$CONTRACT_ADDRESS" ]; then
    echo "=============================================="
    echo "CONTRACT DEPLOYED SUCCESSFULLY"
    echo "Contract Address: $CONTRACT_ADDRESS"
    echo "Deployer Private Key: $PRIVATE_KEY"
    echo "=============================================="
    # Write to a file that other containers could mount/read if needed
    echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" > /app/deployed.env
    echo "DEPLOYER_PRIVATE_KEY=$PRIVATE_KEY" >> /app/deployed.env
else
    echo "WARNING: Could not extract contract address from deployment output"
fi

echo "Hardhat node running on port 8545..."

# Keep the container running with the Hardhat node
wait $HARDHAT_PID
