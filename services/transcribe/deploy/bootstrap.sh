#!/bin/sh
# Creates deploy/.env on the VM with a CSPRNG token. The token is written to
# the file only (mode 600) and is NEVER printed. Safe to re-run: an existing
# .env is kept untouched.
set -eu
cd "$(dirname "$0")"
if [ -f .env ]; then echo ".env exists - leaving it untouched"; exit 0; fi
: "${TRANSCRIBE_HOSTNAME:?export TRANSCRIBE_HOSTNAME=<public hostname> first}"
umask 077
{
  echo "TRANSCRIBE_TOKEN=$(openssl rand -hex 32)"
  echo "TRANSCRIBE_HOSTNAME=${TRANSCRIBE_HOSTNAME}"
  echo "ALLOWED_ORIGINS=${ALLOWED_ORIGINS:-https://labourmarket.ai}"
  echo "WHISPER_MODEL=${WHISPER_MODEL:-small}"
} > .env
echo ".env created (token generated, not shown)"
