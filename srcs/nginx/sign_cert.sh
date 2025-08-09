#!/bin/bash

SUBJECT="/C=${SSL_C}/ST=${SSL_ST}/L=${SSL_LO}/O=${SSL_OP}/OU=${SSL_OU}/CN=${SERVER_NAME}" 
echo "Signing certificate with server name ${SUBJECT}";
openssl req -x509 -newkey rsa:4086 -keyout login.42.fr.key -out login.42.fr.crt -days 666 -nodes -subj "$SUBJECT"

echo "$SUBJECT " > SIGH
