import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type OrangeToken = {
  value: string;
  expiresAt: number;
};

@Injectable()
export class OtpDeliveryService {
  private readonly logger = new Logger(OtpDeliveryService.name);
  private orangeToken?: OrangeToken;

  constructor(private readonly config: ConfigService) {}

  async send(phone: string, code: string): Promise<void> {
    const mode = this.config.get<string>('OTP_MODE') ?? 'disabled';
    if (mode === 'pilot') {
      this.logger.warn(
        `SMS non envoyé : OTP_MODE=pilot, destinataire ${this.maskPhone(phone)}`,
      );
      return;
    }
    if (mode !== 'orange_sms') {
      throw new ServiceUnavailableException(
        'Le fournisseur SMS OTP de production n’est pas configuré',
      );
    }
    await this.sendOrangeSms(phone, code);
  }

  private async sendOrangeSms(phone: string, code: string): Promise<void> {
    const clientId = this.config.get<string>('ORANGE_SMS_CLIENT_ID');
    const clientSecret = this.config.get<string>('ORANGE_SMS_CLIENT_SECRET');
    const senderAddress =
      this.config.get<string>('ORANGE_SMS_SENDER_ADDRESS') ?? 'tel:+2260000';
    const senderName = this.config.get<string>('ORANGE_SMS_SENDER_NAME');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Les identifiants Orange SMS sont absents ou invalides',
      );
    }

    const authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    const token = await this.orangeAccessToken(authorization);
    const encodedSender = encodeURIComponent(senderAddress);
    this.logger.log(
      `Envoi Orange SMS vers ${this.maskPhone(phone)} avec ${senderName || 'le sender par défaut'}`,
    );
    const response = await fetch(
      `https://api.orange.com/smsmessaging/v1/outbound/${encodedSender}/requests`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: `tel:${phone}`,
            senderAddress,
            ...(senderName ? { senderName } : {}),
            outboundSMSTextMessage: {
              message: `ZAAMA : votre code de vérification est ${code}. Il expire dans 5 minutes. Ne le partagez jamais.`,
            },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      this.logger.error(
        `Orange SMS refusé : HTTP ${response.status} pour ${this.maskPhone(phone)}`,
      );
      throw new ServiceUnavailableException(
        `Orange SMS indisponible (${response.status})`,
      );
    }
    const location = response.headers.get('location');
    const resourceId = location?.split('/').filter(Boolean).at(-1);
    this.logger.log(
      `Orange SMS accepté : HTTP ${response.status}, destinataire ${this.maskPhone(phone)}${resourceId ? `, ressource ${resourceId}` : ''}`,
    );
  }

  private async orangeAccessToken(authorization: string): Promise<string> {
    if (this.orangeToken && this.orangeToken.expiresAt > Date.now() + 60_000) {
      return this.orangeToken.value;
    }
    const response = await fetch('https://api.orange.com/oauth/v3/token', {
      method: 'POST',
      headers: {
        authorization,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      this.logger.error(`Token Orange SMS refusé : HTTP ${response.status}`);
      throw new ServiceUnavailableException(
        `Authentification Orange SMS impossible (${response.status})`,
      );
    }
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) {
      throw new ServiceUnavailableException('Réponse Orange SMS invalide');
    }
    this.orangeToken = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return payload.access_token;
  }

  private maskPhone(phone: string): string {
    const normalized = phone.replace(/\D/g, '');
    return normalized.length > 4 ? `***${normalized.slice(-4)}` : '***';
  }
}
