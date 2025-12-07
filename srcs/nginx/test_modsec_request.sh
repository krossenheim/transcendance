#!/bin/sh
# Simple test script to send a malicious-looking request and print recent modsecurity audit log lines
set -ex
curl -k -s "https://localhost/?q=union%20select" -o /dev/null || true
sleep 1
if [ -f /var/log/modsecurity/modsec_audit.log ]; then
  echo "--- last 50 lines of modsec audit log ---"
  tail -n 50 /var/log/modsecurity/modsec_audit.log || true
else
  echo "No modsecurity audit log found at /var/log/modsecurity/modsec_audit.log"
  exit 2
fi
