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
command -v openssl >/dev/null || fail 'openssl est requis.'

ensure_env_value() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "${ENV_FILE}"; then
    if grep -q "^${key}=$" "${ENV_FILE}"; then
      sed -i "s|^${key}=$|${key}=${value}|" "${ENV_FILE}"
    fi
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

# Migration idempotente des installations créées avant le stockage média natif.
ensure_env_value 'STORAGE_DRIVER' 'local'
ensure_env_value 'LOCAL_STORAGE_DIR' "${HOME}/.local/share/zaama/uploads"
ensure_env_value 'PUBLIC_API_URL' 'https://zaamabackend.yingr-ai.com/api/v1'
ensure_env_value 'MEDIA_RELAY_CLEANUP_ENABLED' 'true'
ensure_env_value 'MEDIA_RELAY_READ_RETENTION_DAYS' '30'
ensure_env_value 'MEDIA_RELAY_MAX_RETENTION_DAYS' '90'
ensure_env_value 'MEDIA_RELAY_CLEANUP_INTERVAL_HOURS' '6'
if ! grep -Eq '^MEDIA_SIGNING_SECRET=.{32,}$' "${ENV_FILE}"; then
  if grep -q '^MEDIA_SIGNING_SECRET=' "${ENV_FILE}"; then
    sed -i "s|^MEDIA_SIGNING_SECRET=.*$|MEDIA_SIGNING_SECRET=$(openssl rand -hex 48)|" "${ENV_FILE}"
  else
    printf 'MEDIA_SIGNING_SECRET=%s\n' "$(openssl rand -hex 48)" >> "${ENV_FILE}"
  fi
fi
chmod 600 "${ENV_FILE}"

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

if [[ "${STORAGE_DRIVER:-local}" == 'local' ]]; then
  install -d -m 700 "${LOCAL_STORAGE_DIR:-${HOME}/.local/share/zaama/uploads}"
fi

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
