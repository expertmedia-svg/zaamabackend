#!/usr/bin/env bash
set -Eeuo pipefail

DB_NAME='zaama_prod'
DB_ROLE='zaama_app'
ENV_DIR="${HOME}/.config/zaama"
ENV_FILE="${ENV_DIR}/zaama-api.env"

fail() {
  printf 'ERREUR: %s\n' "$1" >&2
  exit 1
}

[[ ${EUID} -ne 0 ]] || fail 'Exécutez ce script avec l’utilisateur debian, pas avec root.'
command -v sudo >/dev/null || fail 'sudo est requis.'
command -v psql >/dev/null || fail 'Le client PostgreSQL est requis.'
command -v openssl >/dev/null || fail 'openssl est requis.'
command -v node >/dev/null || fail 'Node.js est requis.'
command -v pm2 >/dev/null || fail 'PM2 est requis pour l’utilisateur courant.'

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[[ ${NODE_MAJOR} -ge 20 ]] || fail 'Node.js 20 ou plus récent est requis.'
[[ ! -e "${ENV_FILE}" ]] || fail "${ENV_FILE} existe déjà; aucune donnée existante n’a été modifiée."

ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_ROLE}'" | tr -d '[:space:]')"
DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')"
[[ -z "${ROLE_EXISTS}" ]] || fail "Le rôle ${DB_ROLE} existe déjà; vérifiez-le manuellement."
[[ -z "${DB_EXISTS}" ]] || fail "La base ${DB_NAME} existe déjà; vérifiez-la manuellement."

read -r -p 'Numéro pilote autorisé au format +226XXXXXXXX: ' PILOT_PHONE
[[ "${PILOT_PHONE}" =~ ^\+[1-9][0-9]{7,14}$ ]] || fail 'Numéro E.164 invalide.'
read -r -s -p 'Code OTP pilote à 6 chiffres: ' PILOT_OTP
printf '\n'
[[ "${PILOT_OTP}" =~ ^[0-9]{6}$ ]] || fail 'Le code doit contenir exactement 6 chiffres.'

DB_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET="$(openssl rand -hex 48)"
JWT_REFRESH_SECRET="$(openssl rand -hex 48)"
CONTACT_HASH_SECRET="$(openssl rand -hex 48)"
ADMIN_JWT_SECRET="$(openssl rand -hex 48)"

sudo -u postgres psql -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE ${DB_ROLE} LOGIN PASSWORD '${DB_PASSWORD}'"
sudo -u postgres createdb --owner="${DB_ROLE}" --encoding=UTF8 "${DB_NAME}"

install -d -m 700 "${ENV_DIR}"
umask 077
cat > "${ENV_FILE}" <<EOF
APP_NAME=ZAAMA
APP_ENV=production
NODE_ENV=production
HOST=127.0.0.1
PORT=4110
TRUST_PROXY=true
DATABASE_URL=postgresql://${DB_ROLE}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}?schema=public
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CONTACT_HASH_SECRET=${CONTACT_HASH_SECRET}
ADMIN_JWT_SECRET=${ADMIN_JWT_SECRET}
OTP_MODE=pilot
PILOT_ALLOWED_PHONES=${PILOT_PHONE}
PILOT_OTP=${PILOT_OTP}
OTP_TTL_SECONDS=300
ORANGE_SMS_CLIENT_ID=
ORANGE_SMS_CLIENT_SECRET=
ORANGE_SMS_SENDER_ADDRESS=tel:+2260000
ORANGE_SMS_SENDER_NAME=
CORS_ORIGINS=https://zaamabackend.yingr-ai.com
REDIS_URL=
S3_ENDPOINT=
S3_BUCKET=zaama-prod
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_REGION=us-east-1
S3_PUBLIC_URL=
S3_FORCE_PATH_STYLE=true
MAX_UPLOAD_BYTES=104857600
TURN_URL=
TURN_USERNAME=
TURN_PASSWORD=
EOF
chmod 600 "${ENV_FILE}"

printf '\nProvisionnement ZAAMA terminé.\n'
printf 'Base créée: %s (propriétaire %s)\n' "${DB_NAME}" "${DB_ROLE}"
printf 'Secrets: %s (permissions 600)\n' "${ENV_FILE}"
printf 'Aucun processus PM2 ou site Nginx existant n’a été modifié.\n'
