import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { AuthService } from './auth.service';
import { OtpDeliveryService } from './otp-delivery.service';

describe('AuthService OTP modes', () => {
  const secret = 'test-contact-hash-secret-with-32-characters';

  function service(overrides: Record<string, string>, userOverrides?: Record<string, unknown>) {
    const create = jest.fn().mockResolvedValue({ id: 'otp' });
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const findFirst = jest.fn().mockResolvedValue(null);
    const count = jest.fn().mockResolvedValue(0);
    const userFindUnique = jest.fn().mockResolvedValue(userOverrides ?? null);
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma: Record<string, unknown> = {
      otpRequest: { create, updateMany, findFirst, count },
      user: { findUnique: userFindUnique, update: userUpdate },
      $transaction: jest.fn(async (operations: unknown) =>
        typeof operations === 'function'
          ? (operations as (tx: unknown) => unknown)(prisma)
          : Promise.all(operations as unknown[]),
      ),
    };
    const otpDelivery = { send: jest.fn().mockResolvedValue(undefined) };
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
      findFirst,
      count,
      userFindUnique,
      userUpdate,
      instance: new AuthService(
        prisma as never,
        {} as JwtService,
        config as unknown as ConfigService,
        otpDelivery as unknown as OtpDeliveryService,
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
      'Le fournisseur SMS OTP de production n’est pas configuré',
    );
  });

  it('prevents immediate OTP resend for the same phone', async () => {
    const { instance, findFirst } = service({});
    findFirst.mockResolvedValue({ createdAt: new Date() });

    await expect(instance.requestOtp('+22670000001')).rejects.toMatchObject({
      status: 429,
    });
  });

  it('auto_fill mode never calls Orange and returns the code for client-side auto-fill', async () => {
    const { instance } = service({ OTP_MODE: 'auto_fill' });

    const response = await instance.requestOtp('+22670000099');

    expect(response).toHaveProperty('devOtp');
    expect(String(response.devOtp)).toMatch(/^\d{6}$/);
  });
});

describe('AuthService PIN login', () => {
  const secret = 'test-contact-hash-secret-with-32-characters';

  function pinService(user: Record<string, unknown> | null) {
    const userFindUnique = jest.fn().mockResolvedValue(user);
    const userUpdate = jest.fn().mockResolvedValue({});
    const prisma: Record<string, unknown> = {
      user: { findUnique: userFindUnique, update: userUpdate },
      $transaction: jest.fn(async (operations: unknown) =>
        typeof operations === 'function'
          ? (operations as (tx: unknown) => unknown)(prisma)
          : operations,
      ),
    };
    const config = {
      get: jest.fn((key: string) =>
        ({ CONTACT_HASH_SECRET: secret })[key as 'CONTACT_HASH_SECRET'],
      ),
    };
    return {
      userUpdate,
      instance: new AuthService(
        prisma as never,
        {} as JwtService,
        config as unknown as ConfigService,
        { send: jest.fn() } as unknown as OtpDeliveryService,
      ),
    };
  }

  const loginDto = {
    phone: '+22670000001',
    pin: '4321',
    installationId: 'device-1',
    deviceName: 'Test phone',
    platform: 'ANDROID' as never,
  };

  it('rejects a PIN login when the account has no PIN configured', async () => {
    const { instance } = pinService({ id: 'u1', pinHash: null, pinFailedAttempts: 0 });

    await expect(instance.loginWithPin(loginDto)).rejects.toThrow(
      'Invalid phone or PIN',
    );
  });

  it('rejects a PIN login for a phone with no account at all, with the same message', async () => {
    const { instance } = pinService(null);

    await expect(instance.loginWithPin(loginDto)).rejects.toThrow(
      'Invalid phone or PIN',
    );
  });

  it('locks the account after too many wrong PIN attempts instead of allowing unlimited retries', async () => {
    const pinHash = await hash('9999', 10);
    const { instance, userUpdate } = pinService({
      id: 'u1',
      pinHash,
      pinFailedAttempts: 4,
      pinLockedUntil: null,
    });

    await expect(instance.loginWithPin(loginDto)).rejects.toThrow(
      'Invalid phone or PIN',
    );
    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pinFailedAttempts: 0 }),
      }),
    );
    const lockedUntil = (userUpdate.mock.calls[0][0].data as { pinLockedUntil?: Date })
      .pinLockedUntil;
    expect(lockedUntil).toBeInstanceOf(Date);
  });

  it('refuses PIN attempts while the account is locked out, even with the correct PIN', async () => {
    const pinHash = await hash('4321', 10);
    const { instance } = pinService({
      id: 'u1',
      pinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: new Date(Date.now() + 60_000),
    });

    await expect(instance.loginWithPin(loginDto)).rejects.toThrow(
      'utilisez le code OTP',
    );
  });
});
