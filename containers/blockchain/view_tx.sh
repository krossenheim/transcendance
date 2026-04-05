#!/bin/bash

RPC_URL="${RPC_URL:-http://172.20.0.1:8545}"

if [ -z "$1" ]; then
    echo "Usage: ./view_tx.sh <transaction_hash>"
    echo ""
    echo "Example: ./view_tx.sh 0xddbe85e58af70bd8f32198322537ac92d5b25b8b755158cac93b66150a2a27d8"
    exit 1
fi

TX_HASH=$1

echo "=========================================="
echo "  Blockchain Transaction Viewer"
echo "=========================================="
echo ""
echo "Transaction Hash: $TX_HASH"
echo ""

TX=$(curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionByHash\",\"params\":[\"$TX_HASH\"],\"id\":1}")

RECEIPT=$(curl -s "$RPC_URL" -X POST -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$TX_HASH\"],\"id\":1}")

echo "--- Transaction Details ---"
echo "$TX" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('result'):
    tx = data['result']
    print(f\"From:         {tx.get('from', 'N/A')}\")
    print(f\"To:           {tx.get('to', 'N/A')}\")
    print(f\"Block Number: {int(tx.get('blockNumber', '0x0'), 16)}\")
    print(f\"Gas:          {int(tx.get('gas', '0x0'), 16)}\")
    print(f\"Value:        {int(tx.get('value', '0x0'), 16)} wei\")
else:
    print('Transaction not found')
"

echo ""
echo "--- Receipt ---"
echo "$RECEIPT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('result'):
    r = data['result']
    status = 'SUCCESS ✓' if r.get('status') == '0x1' else 'FAILED ✗'
    print(f\"Status:       {status}\")
    print(f\"Gas Used:     {int(r.get('gasUsed', '0x0'), 16)}\")
    print(f\"Block Hash:   {r.get('blockHash', 'N/A')}\")
    
    logs = r.get('logs', [])
    if logs:
        print(f\"\")
        print(f\"--- Event Logs ({len(logs)}) ---\")
        for i, log in enumerate(logs):
            print(f\"Log {i}:\")
            print(f\"  Contract:   {log.get('address', 'N/A')}\")
            topics = log.get('topics', [])
            if topics:
                print(f\"  Event Sig:  {topics[0][:18]}...\")
                for j, topic in enumerate(topics[1:], 1):
                    val = int(topic, 16)
                    print(f\"  Param {j}:    {val} (0x{val:x})\")
            data = log.get('data', '0x')
            if data and data != '0x':
                data_hex = data[2:]
                params = [data_hex[i:i+64] for i in range(0, len(data_hex), 64)]
                for j, param in enumerate(params):
                    val = int(param, 16)
                    print(f\"  Data {j}:    {val}\")
else:
    print('Receipt not found')
"

echo ""
echo "=========================================="
