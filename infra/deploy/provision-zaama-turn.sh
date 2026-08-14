#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${ZAAMA_TURN_DOMAIN:-zaamabackend.yingr-ai.com}"
ENV_FILE="${ZAAMA_ENV_FILE:-/home/debian/.config/zaama/zaama-api.env}"
TURN_CONFIG='/etc/turnserver-zaama.conf'
TURN_UNIT='/etc/systemd/system/coturn-zaama.service'

fail() {
  printf 'ERREUR: %s\n' "$1" >&2
  exit 1
}

[[ ${EUID} -eq 0 ]] || fail 'Exécutez ce script avec sudo.'
[[ -f "${ENV_FILE}" ]] || fail "Secrets ZAAMA absents de ${ENV_FILE}."
command -v openssl >/dev/null || fail 'openssl est requis.'

if ss -lntuH | awk '{print $5}' | grep -Eq ':(3478|5349)$'; then
  fail 'Le port TURN 3478 ou 5349 est déjà utilisé. Aucun service existant n’a été modifié.'
fi

if ! command -v turnserver >/dev/null; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y coturn
  systemctl disable --now coturn.service >/dev/null 2>&1 || true
fi

CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
[[ -r "${CERT}" && -r "${KEY}" ]] || fail "Certificat TLS absent pour ${DOMAIN}."

SHARED_SECRET="$(openssl rand -hex 32)"
PUBLIC_IP="$(ip -4 route get 1.1.1.1 | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
[[ -n "${PUBLIC_IP}" ]] || fail 'Adresse IPv4 publique introuvable.'

install -o root -g root -m 600 /dev/null "${TURN_CONFIG}"
cat > "${TURN_CONFIG}" <<EOF
listening-port=3478
tls-listening-port=5349
listening-ip=0.0.0.0
relay-ip=${PUBLIC_IP}
external-ip=${PUBLIC_IP}
min-port=49160
max-port=49260
fingerprint
use-auth-secret
static-auth-secret=${SHARED_SECRET}
realm=${DOMAIN}
server-name=${DOMAIN}
cert=${CERT}
pkey=${KEY}
no-cli
no-multicast-peers
no-loopback-peers
stale-nonce=600
total-quota=240
user-quota=12
log-file=stdout
EOF

cat > "${TURN_UNIT}" <<EOF
[Unit]
Description=ZAAMA isolated TURN relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$(command -v turnserver) -c ${TURN_CONFIG}
Restart=on-failure
RestartSec=3
LimitNOFILE=65536
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadOnlyPaths=/etc/letsencrypt

[Install]
WantedBy=multi-user.target
EOF

cp "${ENV_FILE}" "${ENV_FILE}.before-turn.$(date +%Y%m%d%H%M%S)"
sed -i \
  -e "s|^STUN_URL=.*|STUN_URL=stun:${DOMAIN}:3478|" \
  -e "s|^TURN_URL=.*|TURN_URL=turn:${DOMAIN}:3478?transport=udp,turn:${DOMAIN}:3478?transport=tcp,turns:${DOMAIN}:5349?transport=tcp|" \
  -e "s|^TURN_SHARED_SECRET=.*|TURN_SHARED_SECRET=${SHARED_SECRET}|" \
  "${ENV_FILE}"
chmod 600 "${ENV_FILE}"

systemctl daemon-reload
systemctl enable --now coturn-zaama.service
systemctl --no-pager --full status coturn-zaama.service

printf '\nTURN ZAAMA actif sur 3478 TCP/UDP et 5349 TLS.\n'
printf 'Ouvrez aussi UDP 49160:49260 dans le pare-feu de la VM.\n'
printf 'Le secret a été injecté dans %s sans être affiché.\n' "${ENV_FILE}"
printf 'Redéployez ensuite zaama-api pour charger les identifiants TURN temporaires.\n'
