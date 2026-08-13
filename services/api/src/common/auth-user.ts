import type { Request } from 'express';

export interface AuthUser {
  id: string;
  phone: string;
  sessionId: string;
  deviceId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  requestId?: string;
}
