import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  role: string;
}

export interface CurrentUserData {
  userId: string;
  role: string;
  email?: string;
}

export interface AuthenticatedRequest extends Request {
  user: CurrentUserData;
}
