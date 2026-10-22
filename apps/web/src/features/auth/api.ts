import http from '@/lib/http';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
}

export interface RegisterRequest {
  email: string;
  password: string;
  passwordConfirm: string;
}

export interface RegisterResponse {
  id: string;
  email: string;
  status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'SUSPENDED';
}

export const authApi = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await http.post('/auth/login', data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await http.post('/auth/register', data);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await http.post('/auth/logout');
  },
};
