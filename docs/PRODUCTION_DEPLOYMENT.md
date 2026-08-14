# Déploiement pilote ZAAMA sur la VM partagée

Ce déploiement n’utilise pas Docker. Il est volontairement isolé des autres
applications de la VM :

- dossier : `/home/debian/apps/zaamabackend` ;
- processus PM2 : `zaama-api` ;
- écoute privée : `127.0.0.1:4110` ;
- base PostgreSQL : `zaama_prod` ;
- rôle PostgreSQL : `zaama_app` ;
- site Nginx : `zaamabackend.yingr-ai.com`.

Les scripts ne contiennent aucune commande `pm2 restart all`, suppression de
base, remplacement de configuration globale Nginx ou réinitialisation Prisma.

## 1. DNS obligatoire

Créer un enregistrement `A` :

```text
zaamabackend.yingr-ai.com -> IP_PUBLIQUE_DE_LA_VM
```

Vérifier depuis un autre ordinateur :

```bash
dig +short zaamabackend.yingr-ai.com A
```

Ne pas lancer Certbot tant que cette commande ne retourne pas l’IP de la VM.

## 2. Cloner uniquement le backend

```bash
mkdir -p /home/debian/apps
cd /home/debian/apps
git clone https://github.com/expertmedia-svg/zaamabackend.git
cd /home/debian/apps/zaamabackend
```

## 3. Contrôles sans modification

```bash
node --version
npm --version
pm2 list
sudo nginx -t
sudo -u postgres psql -tAc "select version();"
sudo ss -ltnp | grep ':4110 ' || true
```

Node.js 20 ou plus récent est requis. Le port `4110` doit être libre.

## 4. Base et secrets dédiés

```bash
cd /home/debian/apps/zaamabackend
chmod +x infra/deploy/*.sh
./infra/deploy/provision-zaama-vm.sh
```

Le script demande le numéro du testeur et un code OTP pilote. Il crée uniquement
`zaama_app`, `zaama_prod` et `~/.config/zaama/zaama-api.env`. Il s’arrête si un
de ces éléments existe déjà.

## 5. Build, migrations et PM2

```bash
cd /home/debian/apps/zaamabackend
./infra/deploy/deploy-zaama.sh
pm2 show zaama-api
pm2 logs zaama-api --lines 80
```

`prisma migrate deploy` applique uniquement les migrations déjà versionnées. Il
ne crée aucune migration et ne réinitialise aucune donnée.

Une fois le test local réussi :

```bash
curl -fsS http://127.0.0.1:4110/api/v1/health/ready
```

## 6. Activer uniquement le nouveau site Nginx

Vérifier d’abord que le nom n’est pas déjà déclaré :

```bash
sudo nginx -T 2>/dev/null | grep -F 'server_name zaamabackend.yingr-ai.com' || true
```

Si aucune ligne n’apparaît :

```bash
sudo install -m 0644 \
  infra/deploy/nginx/zaamabackend.yingr-ai.com.conf \
  /etc/nginx/sites-available/zaama-api.conf
sudo ln -s /etc/nginx/sites-available/zaama-api.conf \
  /etc/nginx/sites-enabled/zaama-api.conf
sudo nginx -t
sudo systemctl reload nginx
```

Le rechargement ne doit être exécuté que si `nginx -t` réussit.

## 7. HTTPS

Après propagation DNS :

```bash
curl -I http://zaamabackend.yingr-ai.com/api/v1/health/live
sudo certbot --nginx -d zaamabackend.yingr-ai.com --redirect
sudo nginx -t
curl -fsS https://zaamabackend.yingr-ai.com/api/v1/health/ready
```

## 8. Persistance PM2

Quand ZAAMA est validé :

```bash
pm2 save
```

Cette commande sauvegarde la liste courante, y compris les applications déjà
présentes, sans les redémarrer.

## 9. Mise à jour ultérieure par GitHub

```bash
cd /home/debian/apps/zaamabackend
git pull --ff-only
sudo install -m 0644 \
  infra/deploy/nginx/zaamabackend.yingr-ai.com.conf \
  /etc/nginx/sites-available/zaama-api.conf
sudo nginx -t && sudo systemctl reload nginx
./infra/deploy/deploy-zaama.sh
```

Le script cible seulement le processus `zaama-api` grâce à `--only zaama-api`.

Pour déployer la préparation du test fermé publiée dans le commit `879243f` :

```bash
cd /home/debian/apps/zaamabackend
git pull --ff-only
git log -1 --oneline
./infra/deploy/deploy-zaama.sh
curl -fsS http://127.0.0.1:4110/api/v1/health/ready
```

Le résultat de `git log -1 --oneline` doit commencer par `879243f`.

## 10. OTP pour 200 testeurs

Le code OTP fixe du pilote ne convient pas à 200 personnes. Créer une
application Orange Developer et souscrire à SMS Burkina Faso, puis modifier
uniquement `~/.config/zaama/zaama-api.env` :

```dotenv
OTP_MODE=orange_sms
ORANGE_SMS_CLIENT_ID=VOTRE_CLIENT_ID
ORANGE_SMS_CLIENT_SECRET=VOTRE_SECRET
ORANGE_SMS_SENDER_ADDRESS=tel:+2260000
ORANGE_SMS_SENDER_NAME=
OTP_RESEND_COOLDOWN_SECONDS=60
OTP_DAILY_LIMIT_PER_PHONE=8
```

Ne jamais publier ces identifiants dans GitHub. Après la modification :

Laisser `ORANGE_SMS_SENDER_NAME` vide utilise automatiquement le sender Orange
autorisé `SMS 828956`. Ne renseigner `ZAAMA` qu’après son approbation et sa
mise en liste blanche par Orange et les autres opérateurs concernés.

```bash
cd /home/debian/apps/zaamabackend
./infra/deploy/deploy-zaama.sh
```

## 11. Activer le stockage média local, sans Docker

Le script de déploiement crée automatiquement le dossier privé
`~/.local/share/zaama/uploads`, ajoute un secret HMAC aléatoire au fichier
d’environnement s’il manque et conserve les permissions `700`/`600`. Nginx
doit cependant recevoir une seule fois la nouvelle limite et le mode streaming :

```bash
cd /home/debian/apps/zaamabackend
sudo install -m 0644 \
  infra/deploy/nginx/zaamabackend.yingr-ai.com.conf \
  /etc/nginx/sites-available/zaama-api.conf
sudo nginx -t && sudo systemctl reload nginx
./infra/deploy/deploy-zaama.sh
```

Le média n’est pas public : les téléchargements utilisent des liens signés de
10 minutes et l’API ne les délivre qu’aux membres de la conversation.

## 12. Appels réels : TURN natif isolé, sans Docker

Après avoir vérifié que les ports `3478`, `5349` et `49160:49260` ne sont pas
utilisés par un autre service :

```bash
cd /home/debian/apps/zaamabackend
sudo ZAAMA_TURN_DOMAIN=zaamabackend.yingr-ai.com \
  ./infra/deploy/provision-zaama-turn.sh
./infra/deploy/deploy-zaama.sh
```

Ouvrir dans le pare-feu de la VM : TCP/UDP `3478`, TCP `5349` et UDP
`49160:49260`. Le service créé s’appelle uniquement `coturn-zaama`; le script
s’arrête si un port TURN est déjà occupé.

## Limites avant ouverture publique

Ce mode est un pilote privé, pas encore une publication nationale :

- OTP fixe limité aux numéros explicitement autorisés ;
- fournisseur SMS réel encore à intégrer ;
- enveloppe de chiffrement mobile encore destinée au développement ;
- compte Firebase/FCM et TURN à configurer avec leurs secrets réels ;
- signature Play Store définitive à créer et sauvegarder ;
- pentest, audit cryptographique, charge et revue légale requis.
