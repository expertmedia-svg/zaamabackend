// Page statique servie telle quelle par LegalController — voir legal.controller.ts.
// Garder ce contenu synchronisé avec la réalité de l'app (permissions,
// chiffrement, sous-traitants) : c'est ce que Google Play et les
// utilisateurs lisent pour savoir ce que ZAAMA fait de leurs données.
export const PRIVACY_POLICY_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Confidentialité ZAAMA</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Work+Sans:wght@400;500;600;700&display=swap');

  :root {
    --bg: #f6f7f2;
    --surface: #ffffff;
    --surface-alt: #eef1e8;
    --text: #14231c;
    --text-muted: #55645b;
    --border: #dee3d6;
    --accent: #a97c17;
    --accent-strong: #7d5c10;
    --brand: #0f3d2e;
    --brand-soft: #e3eee6;
    --flag-red: #b3382c;
    font-family: 'Work Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
    color-scheme: light dark;
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #0b1613;
      --surface: #112019;
      --surface-alt: #16261f;
      --text: #eaf1ea;
      --text-muted: #a2b3a8;
      --border: #24362c;
      --accent: #e2b94a;
      --accent-strong: #f0c868;
      --brand: #7cc7a1;
      --brand-soft: #16261f;
      --flag-red: #d97361;
    }
  }
  :root[data-theme="dark"] {
    --bg: #0b1613;
    --surface: #112019;
    --surface-alt: #16261f;
    --text: #eaf1ea;
    --text-muted: #a2b3a8;
    --border: #24362c;
    --accent: #e2b94a;
    --accent-strong: #f0c868;
    --brand: #7cc7a1;
    --brand-soft: #16261f;
    --flag-red: #d97361;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    line-height: 1.65;
  }
  h1, h2 {
    font-family: 'Fraunces', Georgia, serif;
    text-wrap: balance;
    color: var(--text);
  }
  a { color: var(--accent-strong); }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  header.top {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 24px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .mark {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: 'Fraunces', serif;
    font-weight: 600;
    font-size: 1.05rem;
    letter-spacing: 0.01em;
  }
  .mark .glyph {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: linear-gradient(155deg, var(--brand), #1a5b45);
    color: var(--accent);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 1rem;
    flex: none;
  }
  .updated {
    font-size: 0.8rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  main {
    max-width: 700px;
    margin: 0 auto;
    padding: 56px 24px 96px;
  }

  .eyebrow {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent-strong);
    margin: 0 0 10px;
  }
  h1 {
    font-size: clamp(1.9rem, 4vw, 2.5rem);
    font-weight: 600;
    margin: 0 0 18px;
  }
  .lede {
    font-size: 1.05rem;
    color: var(--text-muted);
    max-width: 60ch;
    margin: 0 0 8px;
  }
  .lede + .lede { margin-top: 12px; }

  nav.toc {
    margin: 36px 0 8px;
    padding: 18px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  nav.toc p {
    margin: 0 0 10px;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  nav.toc ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px 20px;
  }
  nav.toc a {
    display: flex;
    gap: 8px;
    font-size: 0.92rem;
    text-decoration: none;
    color: var(--text);
    padding: 4px 0;
  }
  nav.toc a:hover { color: var(--accent-strong); }
  nav.toc .num {
    font-variant-numeric: tabular-nums;
    color: var(--accent);
    font-weight: 600;
    width: 1.4em;
    flex: none;
  }

  section.clause {
    padding: 40px 0;
    border-top: 1px solid var(--border);
    scroll-margin-top: 76px;
  }
  section.clause:first-of-type { border-top: none; padding-top: 8px; }
  .clause-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin-bottom: 14px;
  }
  .clause-head .num {
    font-family: 'Fraunces', serif;
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  h2 { font-size: 1.3rem; font-weight: 600; margin: 0; }

  section.clause p { margin: 0 0 14px; color: var(--text); }
  section.clause p:last-child { margin-bottom: 0; }
  section.clause ul { margin: 0 0 14px; padding-left: 1.2em; }
  section.clause li { margin-bottom: 8px; }
  section.clause li:last-child { margin-bottom: 0; }
  strong { font-weight: 600; }

  .data-table {
    display: grid;
    gap: 10px;
    margin: 0 0 6px;
  }
  .data-row {
    display: grid;
    grid-template-columns: minmax(120px, 180px) 1fr;
    gap: 4px 18px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .data-row dt {
    font-weight: 600;
    font-size: 0.88rem;
  }
  .data-row dd {
    margin: 0;
    color: var(--text-muted);
    font-size: 0.92rem;
  }
  @media (max-width: 560px) {
    .data-row { grid-template-columns: 1fr; }
    nav.toc ol { grid-template-columns: 1fr; }
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--brand-soft);
    color: var(--brand);
    margin: 0 6px 6px 0;
  }
  .badge::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  footer {
    max-width: 700px;
    margin: 0 auto;
    padding: 0 24px 64px;
    color: var(--text-muted);
    font-size: 0.86rem;
    border-top: 1px solid var(--border);
    padding-top: 28px;
  }
  footer a { color: var(--text); }
  .stripe {
    height: 4px;
    background: linear-gradient(90deg, var(--brand) 0 33%, var(--accent) 33% 66%, var(--flag-red) 66% 100%);
  }
</style>
</head>
<body>
<div class="stripe"></div>
<header class="top">
  <div class="mark"><span class="glyph">Z</span>ZAAMA</div>
  <div class="updated">Dernière mise à jour&nbsp;: 4 septembre 2026</div>
</header>

<main>
  <p class="eyebrow">Règles de confidentialité</p>
  <h1>Comment ZAAMA traite vos données</h1>
  <p class="lede">ZAAMA est une application de messagerie, d'appels et de petites annonces conçue pour le Burkina Faso, éditée par ComstratMedia. Ce document explique, section par section, quelles données nous recevons, pourquoi, et comment vous gardez le contrôle dessus.</p>
  <p class="lede">Il s'applique à l'application mobile ZAAMA (Android et iOS) et à sa version de bureau.</p>

  <nav class="toc" aria-label="Sommaire">
    <p>Sommaire</p>
    <ol>
      <li><a href="#compte"><span class="num">01</span>Compte et connexion</a></li>
      <li><a href="#contacts"><span class="num">02</span>Contacts</a></li>
      <li><a href="#contenu"><span class="num">03</span>Messages et médias</a></li>
      <li><a href="#appels"><span class="num">04</span>Appels audio et vidéo</a></li>
      <li><a href="#marketplace"><span class="num">05</span>Marketplace et portefeuille</a></li>
      <li><a href="#technique"><span class="num">06</span>Notifications et diagnostics</a></li>
      <li><a href="#sauvegarde"><span class="num">07</span>Sauvegarde Google Drive</a></li>
      <li><a href="#partage"><span class="num">08</span>Partage des données</a></li>
      <li><a href="#droits"><span class="num">09</span>Conservation et vos droits</a></li>
      <li><a href="#mineurs"><span class="num">10</span>Mineurs et modifications</a></li>
    </ol>
  </nav>

  <section class="clause" id="compte">
    <div class="clause-head"><span class="num">01</span><h2>Compte et connexion</h2></div>
    <p>Créer un compte ZAAMA demande seulement votre <strong>numéro de téléphone</strong>. À la connexion, vous recevez un code à usage unique, ou vous utilisez le <strong>code PIN</strong> que vous avez choisi.</p>
    <div class="data-table">
      <div class="data-row"><dt>Numéro de téléphone</dt><dd>Sert d'identifiant de compte et à vous retrouver par vos contacts.</dd></div>
      <div class="data-row"><dt>Code PIN</dt><dd>Stocké uniquement sous forme hachée (bcrypt) — ZAAMA ne connaît jamais votre code en clair et ne peut pas vous le communiquer si vous l'oubliez.</dd></div>
      <div class="data-row"><dt>Profil</dt><dd>Nom affiché, photo de profil et photo de couverture, que vous renseignez librement et pouvez modifier à tout moment.</dd></div>
    </div>
  </section>

  <section class="clause" id="contacts">
    <div class="clause-head"><span class="num">02</span><h2>Contacts</h2></div>
    <p>Si vous l'autorisez, ZAAMA lit votre répertoire téléphonique pour repérer quels contacts utilisent déjà l'application. Chaque numéro est transformé en empreinte cryptographique (hachage) avant de quitter votre appareil : nous ne stockons ni ne consultons jamais vos numéros de contacts en clair, et nous ne les partageons avec personne.</p>
    <p>Refuser cette autorisation n'empêche pas d'utiliser ZAAMA — vous ajoutez alors vos contacts manuellement, par numéro ou QR code.</p>
  </section>

  <section class="clause" id="contenu">
    <div class="clause-head"><span class="num">03</span><h2>Messages et médias</h2></div>
    <p>Les messages texte, images, vidéos, documents et messages vocaux que vous échangez dans une conversation privée sont <strong>chiffrés de bout en bout</strong> : seuls les appareils des participants détiennent les clés pour les lire. Nos serveurs relaient ce contenu chiffré sans pouvoir le déchiffrer.</p>
    <p>Les stories que vous publiez sont visibles par les personnes que vous choisissez, pour la durée que vous définissez, puis supprimées.</p>
  </section>

  <section class="clause" id="appels">
    <div class="clause-head"><span class="num">04</span><h2>Appels audio et vidéo</h2></div>
    <p>ZAAMA accède au micro et, pour les appels vidéo, à la caméra <strong>uniquement pendant un appel actif</strong>. Les flux audio et vidéo circulent en direct entre les appareils des participants (WebRTC) — ils ne sont ni enregistrés, ni stockés sur nos serveurs, ni consultables par ComstratMedia.</p>
  </section>

  <section class="clause" id="marketplace">
    <div class="clause-head"><span class="num">05</span><h2>Marketplace et portefeuille</h2></div>
    <p>Si vous publiez une annonce ou effectuez une transaction via le portefeuille ZAAMA, nous traitons les informations nécessaires à cette opération (détails de l'annonce, historique des transactions). Les paiements sont traités par notre prestataire de paiement partenaire ; ZAAMA ne stocke pas vos identifiants bancaires.</p>
  </section>

  <section class="clause" id="technique">
    <div class="clause-head"><span class="num">06</span><h2>Notifications et diagnostics</h2></div>
    <div class="data-table">
      <div class="data-row"><dt>Jeton de notification</dt><dd>Un identifiant technique (Firebase Cloud Messaging) permet de vous prévenir d'un message ou d'un appel entrant quand l'app est fermée.</dd></div>
      <div class="data-row"><dt>Rapports de plantage</dt><dd>Si l'application se ferme de façon inattendue, un rapport technique (Firebase Crashlytics) nous aide à corriger le problème — il ne contient pas le contenu de vos conversations.</dd></div>
    </div>
  </section>

  <section class="clause" id="sauvegarde">
    <div class="clause-head"><span class="num">07</span><h2>Sauvegarde Google Drive (facultative)</h2></div>
    <p>Vous pouvez activer une sauvegarde chiffrée de vos discussions vers <strong>votre propre compte Google Drive</strong>. Cette sauvegarde est chiffrée avant l'envoi avec une clé que vous seul détenez : ni Google ni ComstratMedia ne peuvent la lire. Vous pouvez la désactiver et supprimer ces fichiers depuis votre Drive à tout moment.</p>
  </section>

  <section class="clause" id="partage">
    <div class="clause-head"><span class="num">08</span><h2>Partage des données</h2></div>
    <p>Nous ne vendons vos données à personne et ne diffusons pas de publicité ciblée dans ZAAMA. Vos données ne sont transmises qu'aux prestataires strictement nécessaires au fonctionnement du service :</p>
    <span class="badge">Hébergement de l'infrastructure</span>
    <span class="badge">Firebase (Google) — notifications et diagnostics</span>
    <span class="badge">Prestataire de paiement — transactions du portefeuille</span>
    <p>Ces prestataires n'utilisent vos données que pour exécuter le service ZAAMA, sous nos instructions.</p>
  </section>

  <section class="clause" id="droits">
    <div class="clause-head"><span class="num">09</span><h2>Conservation et vos droits</h2></div>
    <p>Vos données sont conservées tant que votre compte est actif. Vous pouvez à tout moment :</p>
    <ul>
      <li>Modifier ou supprimer votre profil, vos contenus et votre code PIN depuis l'application.</li>
      <li>Demander l'export ou la suppression complète de votre compte et de vos données en nous écrivant à l'adresse ci-dessous.</li>
      <li>Retirer une autorisation (contacts, caméra, micro, notifications) depuis les réglages de votre appareil.</li>
    </ul>
    <p>Une demande de suppression de compte est traitée sous 30 jours au plus.</p>
  </section>

  <section class="clause" id="mineurs">
    <div class="clause-head"><span class="num">10</span><h2>Mineurs et modifications</h2></div>
    <p>ZAAMA est destinée aux personnes de <strong>16 ans et plus</strong>. Nous ne collectons pas sciemment de données concernant des enfants plus jeunes.</p>
    <p>Cette politique peut évoluer avec l'application ; toute modification importante sera annoncée dans l'app avant sa prise d'effet. La date en haut de cette page indique sa dernière mise à jour.</p>
  </section>
</main>

<footer>
  <p>ZAAMA est éditée par ComstratMedia. Pour toute question sur vos données ou pour exercer vos droits, écrivez à <a href="mailto:expertmedia@comstratmedia.com">expertmedia@comstratmedia.com</a>.</p>
</footer>
</body>
</html>
`;
