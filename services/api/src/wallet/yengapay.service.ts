import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface YengaPayPaymentIntent {
  id: string;
  reference: string;
  checkoutUrl: string;
  transactionStatus: string;
  paymentAmount: number;
  paymentFees: number;
  currency: string;
}

export interface YengaPayPaymentUpdate {
  paymentStatus: string;
  paymentIntentId: string;
  reference: string;
  transId?: string;
  projectId?: string;
  paymentAmount: number;
  paymentFees?: number;
  currency: string;
}

type JsonObject = Record<string, unknown>;

@Injectable()
export class YengaPayService {
  private readonly logger = new Logger(YengaPayService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('YENGAPAY_API_KEY') &&
        this.config.get<string>('YENGAPAY_ORGANIZATION_ID') &&
        this.config.get<string>('YENGAPAY_PROJECT_ID') &&
        this.config.get<string>('YENGAPAY_WEBHOOK_SECRET'),
    );
  }

  async createWalletTopUp(input: {
    amountXof: number;
    reference: string;
    customerNumber: string;
  }): Promise<YengaPayPaymentIntent> {
    const result = await this.request<JsonObject>(
      `/groups/${encodeURIComponent(this.organizationId())}/payment-intent/${encodeURIComponent(this.projectId())}`,
      {
        method: 'POST',
        body: JSON.stringify({
          paymentAmount: input.amountXof,
          reference: input.reference,
          customerNumber: input.customerNumber,
          articles: [
            {
              title: 'Recharge ZAAMA Wallet',
              description: `Recharge du portefeuille ${input.reference}`,
              price: input.amountXof,
            },
          ],
          additionalInfos: { source: 'ZAAMA_WALLET' },
        }),
      },
    );
    return this.parseIntent(result, input.reference, input.amountXof);
  }

  async getPaymentIntent(id: string): Promise<YengaPayPaymentIntent> {
    const result = await this.request<JsonObject>(
      `/groups/${encodeURIComponent(this.organizationId())}/payment-intent/project/${encodeURIComponent(this.projectId())}/intent/${encodeURIComponent(id)}`,
      { method: 'GET' },
    );
    return this.parseIntent(result);
  }

  verifyWebhook(payload: JsonObject, receivedHash?: string): void {
    const secret = this.required('YENGAPAY_WEBHOOK_SECRET');
    const expectedHash = createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const received = (receivedHash ?? '').trim().toLowerCase();
    const left = Buffer.from(expectedHash, 'utf8');
    const right = Buffer.from(received, 'utf8');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Signature webhook YengaPay invalide');
    }
  }

  parseWebhook(payload: JsonObject): YengaPayPaymentUpdate {
    const projectId = this.stringValue(payload.projectId);
    if (projectId && projectId !== this.projectId()) {
      throw new BadGatewayException('Projet YengaPay inattendu');
    }
    return {
      paymentStatus: this.requiredString(payload.paymentStatus, 'paymentStatus'),
      paymentIntentId: this.requiredString(
        payload.paymentIntentId,
        'paymentIntentId',
      ),
      reference: this.requiredString(payload.reference, 'reference'),
      transId: this.stringValue(payload.transId),
      projectId,
      paymentAmount: this.requiredAmount(payload.paymentAmount),
      paymentFees: this.optionalNumber(payload.paymentFees),
      currency: this.requiredString(payload.currency, 'currency'),
    };
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-api-key': this.required('YENGAPAY_API_KEY'),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      this.logger.error(
        `YengaPay indisponible: ${error instanceof Error ? error.message : 'erreur réseau'}`,
      );
      throw new ServiceUnavailableException('YengaPay est temporairement indisponible');
    } finally {
      clearTimeout(timeout);
    }

    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new BadGatewayException('Réponse YengaPay invalide');
    }
    if (!response.ok) {
      const data = this.objectValue(result);
      const error = this.objectValue(data.error);
      const providerMessage =
        this.stringValue(error.message) ?? this.stringValue(data.message);
      this.logger.warn(
        `YengaPay HTTP ${response.status}${providerMessage ? `: ${providerMessage}` : ''}`,
      );
      throw new BadGatewayException(
        providerMessage ?? 'Le paiement YengaPay a été refusé',
      );
    }
    return result as T;
  }

  private parseIntent(
    payload: JsonObject,
    expectedReference?: string,
    fallbackAmount?: number,
  ): YengaPayPaymentIntent {
    const reference = this.requiredString(payload.reference, 'reference');
    if (expectedReference && reference !== expectedReference) {
      throw new BadGatewayException('Référence YengaPay incohérente');
    }
    const checkoutUrl =
      this.stringValue(payload.checkoutPageUrlWithPaymentToken) ?? '';
    if (checkoutUrl && !this.isAllowedCheckoutUrl(checkoutUrl)) {
      throw new BadGatewayException('URL de checkout YengaPay invalide');
    }
    return {
      id: this.requiredString(payload.id, 'id'),
      reference,
      checkoutUrl,
      transactionStatus:
        this.stringValue(payload.transactionStatus) ?? 'PENDING',
      paymentAmount:
        this.optionalNumber(payload.paymentAmount) ?? fallbackAmount ?? 0,
      paymentFees: this.optionalNumber(payload.paymentFees) ?? 0,
      currency: this.stringValue(payload.currency) ?? 'XOF',
    };
  }

  private baseUrl(): string {
    const configured =
      this.config.get<string>('YENGAPAY_BASE_URL') ??
      'https://api.yengapay.com/api/v1';
    const value = configured.replace(/\/+$/, '');
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException('YengaPay est mal configuré');
    }
    if (url.protocol !== 'https:') {
      throw new ServiceUnavailableException('YengaPay doit utiliser HTTPS');
    }
    return value;
  }

  private isAllowedCheckoutUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        (url.hostname === 'checkout.yengapay.com' ||
          url.hostname === 'api.yengapay.com' ||
          url.hostname === 'api.sandbox.yengapay.com')
      );
    } catch {
      return false;
    }
  }

  private organizationId(): string {
    return this.required('YENGAPAY_ORGANIZATION_ID');
  }

  private projectId(): string {
    return this.required('YENGAPAY_PROJECT_ID');
  }

  private required(key: string): string {
    const value = this.config.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException('Le paiement YengaPay n’est pas configuré');
    }
    return value;
  }

  private requiredString(value: unknown, field: string): string {
    const parsed = this.stringValue(value);
    if (!parsed) throw new BadGatewayException(`Champ YengaPay absent: ${field}`);
    return parsed;
  }

  private requiredAmount(value: unknown): number {
    const amount = this.optionalNumber(value);
    if (!amount || amount <= 0 || !Number.isInteger(amount)) {
      throw new BadGatewayException('Montant YengaPay invalide');
    }
    return amount;
  }

  private optionalNumber(value: unknown): number | undefined {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private objectValue(value: unknown): JsonObject {
    return typeof value === 'object' && value !== null
      ? (value as JsonObject)
      : {};
  }
}
