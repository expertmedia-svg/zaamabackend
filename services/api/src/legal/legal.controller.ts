import { Controller, Get, Header } from '@nestjs/common';
import { PRIVACY_POLICY_HTML } from './privacy-policy.html';

// Hors du préfixe /api/v1 (voir main.ts) : sert une URL propre et stable,
// nécessaire pour la fiche Play Store / App Store et pour toute personne
// qui consulte directement la politique de confidentialité de ZAAMA.
@Controller('privacy')
export class LegalController {
  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPrivacyPolicy(): string {
    return PRIVACY_POLICY_HTML;
  }
}
