# Publication ZAAMA en test fermé Google Play

## Décisions irréversibles avant le premier envoi

1. Le nom de package Android définitif est validé : `com.expertmedia.zaama`.
   Il ne doit plus être modifié après le premier envoi dans Play Console.
2. Créer et sauvegarder la clé d’upload dans deux emplacements sécurisés.
3. Activer Play App Signing lors de la première release.

## Prérequis techniques bloquants

- Enregistrer l'application Android Firebase avec le package exact
  `com.expertmedia.zaama`. Une application Firebase créée avec l'ancien package
  ne recevra pas les notifications de ZAAMA.
- Configurer un fournisseur OTP réel. Pour Orange SMS Burkina Faso : créer une
  application Orange Developer, souscrire à l’API, acheter un bundle, puis
  définir `OTP_MODE=orange_sms`, `ORANGE_SMS_CLIENT_ID` et
  `ORANGE_SMS_CLIENT_SECRET` sur la VM.
- Vérifier l’espace disque et la sauvegarde du stockage média local privé. Une
  migration vers S3-compatible reste possible sans changer l’application.
- Ne pas présenter le wallet comme un moyen de paiement réel tant que les
  contrats Orange Money/Moov Money et les obligations réglementaires ne sont
  pas finalisés.
- Les messages et médias utilisent une enveloppe par appareil
  X25519/HKDF-SHA-256/AES-256-GCM. Un audit cryptographique indépendant reste
  obligatoire avant de revendiquer publiquement une sécurité équivalente au
  protocole Signal dans la fiche Play Store.

## Build signé

Après création de `android/key.properties` :

```powershell
cd apps/mobile
flutter build appbundle --release `
  --dart-define=APP_NAME=ZAAMA `
  --dart-define=APP_ENV=production `
  --dart-define=API_BASE_URL=https://zaamabackend.yingr-ai.com/api/v1 `
  --dart-define=REALTIME_URL=https://zaamabackend.yingr-ai.com/realtime `
  --dart-define=GOOGLE_DRIVE_SERVER_CLIENT_ID=VOTRE_CLIENT_WEB.apps.googleusercontent.com
```

Le fichier à envoyer est `build/app/outputs/bundle/release/app-release.aab`.
Incrémenter `version: 1.0.0+1` dans `pubspec.yaml` à chaque nouvel envoi.

Avant le build, terminer la configuration OAuth Android/Drive décrite dans
[`GOOGLE_DRIVE_BACKUP.md`](GOOGLE_DRIVE_BACKUP.md), avec les SHA-1 debug, clé
d'envoi et Play App Signing.

## Play Console

1. Créer l’application ZAAMA, type Application, gratuite.
2. Compléter la fiche principale, la politique de confidentialité, l’accès à
   l’application, la sécurité des données, la classification du contenu, les
   annonces publicitaires, le public cible et la déclaration financière.
3. Dans Test et publier > Tests > Test fermé, créer la piste `pilote-200`.
4. Importer une liste CSV sans BOM ou un Google Group contenant les comptes
   Google des testeurs.
5. Envoyer l’AAB signé, ajouter les notes de version, faire vérifier puis
   déployer la release sur la piste fermée.
6. Partager le lien d’adhésion avec les testeurs et centraliser leurs retours.

Un compte développeur personnel créé après le 13 novembre 2023 doit conserver
au moins 12 testeurs inscrits pendant 14 jours consécutifs avant de demander
l’accès à la production publique.

## Contenu utilisateur et support

ZAAMA doit publier des conditions d’utilisation, des règles communautaires et
une politique de confidentialité. Les signalements doivent être traités et les
utilisateurs doivent pouvoir bloquer un contact et supprimer leur compte.

La fiche Play doit fournir une adresse support surveillée et des instructions
d’accès permettant à l’équipe Google de recevoir un OTP de test.
