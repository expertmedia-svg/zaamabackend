import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    listSessions: jest.fn(),
    revokeSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: JwtService, useValue: { sign: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should request an OTP', async () => {
    authServiceMock.requestOtp.mockResolvedValue({ success: true });
    await expect(controller.requestOtp({ phone: '+22670000001' })).resolves.toEqual({ success: true });
  });
});
