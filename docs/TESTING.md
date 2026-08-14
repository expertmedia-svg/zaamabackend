# Testing

## Backend
- npm --workspace services/api test

## Flutter
- cd apps/mobile && flutter test

## End-to-end

Avec l’API et PostgreSQL démarrés :

```powershell
npm run test:e2e:local
```

Le scénario A/B réel vérifie : OTP et sessions, message persistant, réaction,
accusé READ, Story et vue, appel connecté/terminé, profil et appareils.

## Règles
- Les tests doivent vérifier le comportement réel et non des mocks uniquement.
- Les cas critiques: auth, message send, offline sync, stories expiry.

## Limites avant publication publique

- `DEV_OTP` doit être remplacé par un fournisseur SMS national/régional.
- Les médias de test sont des enveloppes limitées ; S3 chiffré est requis.
- Les appels testent la signalisation et la persistance ; TURN/WebRTC est requis
  pour transporter réellement l’audio/vidéo entre deux réseaux.
- Tester la rotation, la révocation et la récupération des clés par appareil.
  L’enveloppe X25519/HKDF/AES-GCM doit être auditée avant toute comparaison
  publique avec le protocole Signal.
- FCM/APNs, observabilité, sauvegardes, pentest et tests de charge restent requis.
