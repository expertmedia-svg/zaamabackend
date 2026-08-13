#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${ZAAMA_APP_DIR:-${HOME}/apps/zaamabackend}"
ENV_FILE="${ZAAMA_ENV_FILE:-${HOME}/.config/zaama/zaama-api.env}"
PORT=4110

fail() {
  printf 'ERREUR: %s\n' "$1" >&2
  exit 1
}

[[ ${EUID} -ne 0 ]] || fail 'Exécutez ce script avec l’utilisateur debian, pas avec root.'
[[ -f "${APP_DIR}/package-lock.json" ]] || fail "Projet absent de ${APP_DIR}."
[[ -f "${ENV_FILE}" ]] || fail "Secrets absents de ${ENV_FILE}."
command -v node >/dev/null || fail 'Node.js est requis.'
command -v npm >/dev/null || fail 'npm est requis.'
command -v pm2 >/dev/null || fail 'PM2 est requis.'
command -v curl >/dev/null || fail 'curl est requis.'

if ! pm2 describe zaama-api >/dev/null 2>&1; then
  if ss -ltnH | awk '{print $4}' | grep -Eq ":${PORT}$"; then
    fail "Le port ${PORT} est déjà occupé par un service qui n’est pas zaama-api."
  fi
fi

cd "${APP_DIR}"

# Les outils de compilation (Nest CLI, TypeScript) sont des devDependencies.
# Installez-les explicitement avant de charger NODE_ENV=production.
npm ci --include=dev

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

npm run prisma:generate
npm --workspace services/api run build
npx prisma migrate deploy
npx prisma migrate status
npm prune --omit=dev

ZAAMA_APP_DIR="${APP_DIR}" ZAAMA_ENV_FILE="${ENV_FILE}" \
  pm2 startOrReload infra/deploy/ecosystem.config.cjs \
    --only zaama-api --env production --update-env

sleep 3
curl --fail --silent --show-error \
  "http://127.0.0.1:${PORT}/api/v1/health/ready"
printf '\nZAAMA API est prête sur 127.0.0.1:%s.\n' "${PORT}"
printf 'Les autres processus PM2 n’ont pas été ciblés.\n'
