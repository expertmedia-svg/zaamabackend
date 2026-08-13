# Déploiement pilote ZAAMA sur une VM partagée

Cette procédure n’utilise pas Docker et isole ZAAMA des autres applications :

- code : `/home/debian/apps/zaamabackend` ;
- processus PM2 : `zaama-api` ;
- écoute : `127.0.0.1:4110` ;
- base/rôle PostgreSQL : `zaama_prod` / `zaama_app` ;
- site Nginx : `zaamabackend.yingr-ai.com`.

Les scripts ne redémarrent jamais tous les processus PM2, ne suppriment aucune
base et ne remplacent aucune configuration globale Nginx.

## 1. DNS

Créer l’enregistrement suivant avant Certbot :

```text
zaamabackend.yingr-ai.com -> IP_PUBLIQUE_DE_LA_VM
```

Vérifier avec `dig +short zaamabackend.yingr-ai.com A`.

## 2. Cloner uniquement ce backend

```bash
mkdir -p /home/debian/apps
cd /home/debian/apps
git clone https://github.com/expertmedia-svg/zaamabackend.git
cd /home/debian/apps/zaamabackend
```

## 3. Contrôles préalables

```bash
node --version
npm --version
pm2 list
sudo nginx -t
sudo -u postgres psql -tAc "select version();"
sudo ss -ltnp | grep ':4110 ' || true
```

Node.js 20.19 ou plus récent est requis. Le port 4110 doit être libre.

## 4. Base et secrets dédiés

```bash
cd /home/debian/apps/zaamabackend
chmod +x infra/deploy/*.sh
./infra/deploy/provision-zaama-vm.sh
```

Le script demande le numéro pilote et son code OTP. Il s’arrête si la base, le
rôle ou le fichier de secrets existent déjà.

## 5. Installation, migrations et PM2

```bash
./infra/deploy/deploy-zaama.sh
pm2 show zaama-api
pm2 logs zaama-api --lines 80
curl -fsS http://127.0.0.1:4110/api/v1/health/ready
```

`prisma migrate deploy` applique seulement les migrations versionnées.

## 6. Activer seulement le site ZAAMA

Vérifier d’abord que le domaine n’est pas déjà configuré :

```bash
sudo nginx -T 2>/dev/null | grep -F 'server_name zaamabackend.yingr-ai.com' || true
```

S’il n’apparaît pas :

```bash
sudo install -m 0644 infra/deploy/nginx/zaamabackend.yingr-ai.com.conf /etc/nginx/sites-available/zaama-api.conf
sudo ln -s /etc/nginx/sites-available/zaama-api.conf /etc/nginx/sites-enabled/zaama-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 7. HTTPS et persistance

Après propagation du DNS :

```bash
sudo certbot --nginx -d zaamabackend.yingr-ai.com --redirect
sudo nginx -t
curl -fsS https://zaamabackend.yingr-ai.com/api/v1/health/ready
pm2 save
```

## 8. Mise à jour depuis GitHub

```bash
cd /home/debian/apps/zaamabackend
git pull --ff-only
./infra/deploy/deploy-zaama.sh
```

Le script PM2 cible uniquement `zaama-api` avec `--only zaama-api`.

## Avant l’ouverture publique

Le pilote conserve des limites intentionnelles : OTP fixe allowlisté, aucun
fournisseur SMS réel, connecteurs Orange/Moov à configurer, S3/TURN/push à
fournir, et audits sécurité/charge/conformité encore requis.
