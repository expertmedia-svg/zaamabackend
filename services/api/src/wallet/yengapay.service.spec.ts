import { BadGatewayException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { YengaPayService } from './yengapay.service';

describe('YengaPayService', () => {
  const values: Record<string, string> = {
    YENGAPAY_API_KEY: 'sk_test_value',
    YENGAPAY_ORGANIZATION_ID: 'group-1',
    YENGAPAY_PROJECT_ID: 'project-1',
    YENGAPAY_WEBHOOK_SECRET: 'webhook-secret-value',
  };
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  const service = new YengaPayService(config);

  const payload = {
    paymentStatus: 'DONE',
    transId: 'YP-123',
    paymentIntentId: 'intent-1',
    projectId: 'project-1',
    paymentAmount: 975,
    paymentFees: 25,
    reference: 'YGP-123',
    currency: 'XOF',
  };

  it('accepte une signature HMAC valide et normalise le webhook', () => {
    const signature = createHmac('sha256', values.YENGAPAY_WEBHOOK_SECRET)
      .update(JSON.stringify(payload))
      .digest('hex');

    expect(() => service.verifyWebhook(payload, signature)).not.toThrow();
    expect(service.parseWebhook(payload)).toEqual(payload);
  });

  it('refuse une signature invalide en comparaison sûre', () => {
    expect(() => service.verifyWebhook(payload, '0'.repeat(64))).toThrow(
      UnauthorizedException,
    );
  });

  it('refuse un projet ou un montant incohérent', () => {
    expect(() => service.parseWebhook({ ...payload, projectId: 'other' })).toThrow(
      BadGatewayException,
    );
    expect(() => service.parseWebhook({ ...payload, paymentAmount: -1 })).toThrow(
      BadGatewayException,
    );
  });
});
