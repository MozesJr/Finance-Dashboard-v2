import { useMutation } from '@tanstack/react-query';
import { authApi, LoginRequest, RegisterRequest } from './api';

export function useLogin() {
  return useMutation({
    mutationFn: (data: LoginRequest) => authApi.login(data),
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (data: RegisterRequest) => authApi.register(data),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: () => authApi.logout(),
  });
}
