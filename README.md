# ZAAMA Backend

Backend API de ZAAMA, sans Docker. Ce dépôt contient uniquement NestJS,
Prisma/PostgreSQL, les migrations, les tests et la configuration isolée de
déploiement PM2/Nginx.

Fonctionnalités actuellement exposées : authentification et sessions,
utilisateurs et contacts, conversations et messages temps réel, groupes,
stories, appels, marketplace, commandes, wallet XOF et stockage média S3.

## Développement local

Prérequis : Node.js 20.19 ou plus récent, npm et PostgreSQL.

```bash
npm ci
cp .env.example .env
# Adapter DATABASE_URL au PostgreSQL local.
npm run prisma:generate
npm run migrate:deploy
npm run dev
```

L’API locale répond sur `http://127.0.0.1:4000/api/v1` par défaut. Contrôles :

```bash
npm test
npm run build
curl http://127.0.0.1:4000/api/v1/health/live
```

La référence des routes est versionnée dans [docs/API.md](docs/API.md).

## Déploiement sur la VM

Le déploiement prévu utilise :

- `/home/debian/apps/zaamabackend` pour le code ;
- `zaama-api` comme seul processus PM2 ciblé ;
- `127.0.0.1:4110` comme port privé ;
- `zaama_prod` et `zaama_app` pour PostgreSQL ;
- `zaamabackend.yingr-ai.com` comme serveur Nginx.

Suivre [docs/PRODUCTION_DEPLOYMENT.md](docs/PRODUCTION_DEPLOYMENT.md). Les vrais
secrets ne doivent jamais être ajoutés à Git.

## Limite du pilote

Le mode OTP pilote autorise uniquement les numéros explicitement configurés.
Avant une ouverture publique, il faut brancher un fournisseur SMS réel ainsi
que les connecteurs opérateurs réels du wallet, puis réaliser les audits de
sécurité, de charge et de conformité nécessaires.
