import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';

describe('AuthService OTP modes', () => {
  const secret = 'test-contact-hash-secret-with-32-characters';

  function service(overrides: Record<string, string>) {
    const create = jest.fn().mockResolvedValue({ id: 'otp' });
    const prisma = { otpRequest: { create } };
    const values = {
      NODE_ENV: 'production',
      APP_ENV: 'production',
      CONTACT_HASH_SECRET: secret,
      OTP_MODE: 'pilot',
      PILOT_ALLOWED_PHONES: '+22670000001',
      PILOT_OTP: '654321',
      ...overrides,
    };
    const config = {
      get: jest.fn((key: string) => values[key as keyof typeof values]),
    };
    return {
      create,
      instance: new AuthService(
        prisma as never,
        {} as JwtService,
        config as unknown as ConfigService,
      ),
    };
  }

  it('records the pilot OTP only for an explicitly allowed phone', async () => {
    const { instance, create } = service({});

    const response = await instance.requestOtp('+22670000001');

    const phoneHash = createHmac('sha256', secret)
      .update('+22670000001')
      .digest('hex');
    const expectedCodeHash = createHmac('sha256', secret)
      .update(`${phoneHash}:654321`)
      .digest('hex');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codeHash: expectedCodeHash }),
      }),
    );
    expect(response).not.toHaveProperty('devOtp');
  });

  it('does not create a usable pilot OTP for a phone outside the allowlist', async () => {
    const { instance, create } = service({});

    await instance.requestOtp('+22670000099');

    const phoneHash = createHmac('sha256', secret)
      .update('+22670000099')
      .digest('hex');
    const forbiddenCodeHash = createHmac('sha256', secret)
      .update(`${phoneHash}:654321`)
      .digest('hex');
    expect(create.mock.calls[0][0].data.codeHash).not.toBe(forbiddenCodeHash);
  });

  it('refuses production OTP requests without an explicit provider mode', async () => {
    const { instance } = service({ OTP_MODE: 'disabled' });

    await expect(instance.requestOtp('+22670000001')).rejects.toThrow(
      'Le fournisseur SMS OTP de production n’est pas encore configuré',
    );
  });
});
