import http from '@/lib/http';
import { User } from 'shared';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  passwordConfirm: string;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<User> => {
    const response = await http.post('/auth/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<User> => {
    const response = await http.post('/auth/register', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await http.post('/auth/logout');
  },
};
