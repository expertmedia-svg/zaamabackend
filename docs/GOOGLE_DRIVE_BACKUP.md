# Sauvegarde privée Google Drive

ZAAMA conserve les messages et les médias déchiffrés sur chaque téléphone. Le
backend transporte uniquement les pièces jointes chiffrées pendant une durée
limitée afin que tous les membres de la conversation puissent les télécharger.

La sauvegarde Google Drive utilise `appDataFolder` et le scope minimal
`https://www.googleapis.com/auth/drive.appdata`. Les fichiers ne sont pas
visibles dans l'interface Drive et ne sont accessibles que par ZAAMA.

## Sécurité et restauration

- La sauvegarde est chiffrée sur le téléphone avec AES-256-GCM.
- La clé est dérivée de la phrase de récupération par PBKDF2-HMAC-SHA256.
- Ni Google, ni le backend ZAAMA, ni l'équipe ZAAMA ne reçoivent cette phrase.
- La restauration est refusée si l'identifiant du compte ZAAMA connecté ne
  correspond pas à celui de la sauvegarde.
- Une sauvegarde quotidienne peut être lancée au démarrage après une première
  sauvegarde manuelle réussie.
- Une phrase perdue rend la sauvegarde irrécupérable. Elle doit être conservée
  hors du téléphone.

## Configuration Google Cloud obligatoire

1. Activer **Google Drive API** dans le projet Google Cloud de ZAAMA.
2. Configurer l'écran de consentement OAuth avec le nom, le domaine, la
   politique de confidentialité et le support ZAAMA.
3. Créer un client OAuth Android pour `com.expertmedia.zaama` avec le SHA-1 de
   la clé de développement, puis un autre pour la clé d'envoi Play.
4. Après la première publication, ajouter également le SHA-1 du certificat
   **Play App Signing** affiché dans Play Console.
5. Créer un client OAuth de type **Application Web**. Son identifiant public
   est le `GOOGLE_DRIVE_SERVER_CLIENT_ID`; aucun secret OAuth ne doit être mis
   dans Flutter ou Git.
6. Tant que l'écran OAuth est en mode test, ajouter les comptes Google des
   testeurs autorisés.

Empreintes Android locales :

```powershell
cd apps/mobile/android
./gradlew signingReport
```

Lancement sur téléphone :

```powershell
cd apps/mobile
flutter run `
  --dart-define=APP_ENV=production `
  --dart-define=API_BASE_URL=https://zaamabackend.yingr-ai.com/api/v1 `
  --dart-define=REALTIME_URL=https://zaamabackend.yingr-ai.com/realtime `
  --dart-define=GOOGLE_DRIVE_SERVER_CLIENT_ID=VOTRE_CLIENT_WEB.apps.googleusercontent.com
```

Build Play Store :

```powershell
flutter build appbundle --release `
  --dart-define=APP_NAME=ZAAMA `
  --dart-define=APP_ENV=production `
  --dart-define=API_BASE_URL=https://zaamabackend.yingr-ai.com/api/v1 `
  --dart-define=REALTIME_URL=https://zaamabackend.yingr-ai.com/realtime `
  --dart-define=GOOGLE_DRIVE_SERVER_CLIENT_ID=VOTRE_CLIENT_WEB.apps.googleusercontent.com
```

## Rétention du relais média sur la VM

Le nettoyage est activé par défaut : un média lu par tous les destinataires est
supprimé du relais après 30 jours, et tout média est supprimé au plus tard après
90 jours. Les fichiers locaux et les sauvegardes Drive ne sont pas concernés.

```dotenv
MEDIA_RELAY_CLEANUP_ENABLED=true
MEDIA_RELAY_READ_RETENTION_DAYS=30
MEDIA_RELAY_MAX_RETENTION_DAYS=90
MEDIA_RELAY_CLEANUP_INTERVAL_HOURS=6
```

Pour modifier ces valeurs, éditer `~/.config/zaama/zaama-api.env`, puis relancer
le déploiement. Ne jamais mettre de secret Google OAuth dans ce fichier : le
client ID Flutter est public, le client secret n'est pas utilisé.

## Limites assumées

- Google Drive n'est pas utilisé pour envoyer directement un fichier à un
  destinataire : le dossier privé de l'expéditeur ne lui est pas accessible.
- Un appareil doit avoir téléchargé un média avant de pouvoir le sauvegarder.
- La première sauvegarde et toute restauration demandent une action explicite
  de l'utilisateur et sa phrase de récupération.

Références :

- https://developers.google.com/workspace/drive/api/guides/appdata
- https://pub.dev/packages/google_sign_in
- https://pub.dev/packages/google_sign_in_android
