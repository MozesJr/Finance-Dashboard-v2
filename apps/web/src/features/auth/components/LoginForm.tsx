import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, LoginInput } from 'shared';
import { useLogin } from '../hooks';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { AxiosError } from 'axios';

export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const { mutate: login, isPending } = useLogin();
  const [apiError, setApiError] = useState<string>('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    setApiError('');
    login(data, {
      onSuccess: (response) => {
        setUser(response);
        const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
        navigate(from);
      },
      onError: (error) => {
        const axiosError = error as AxiosError<{ message: string }>;
        const message = axiosError.response?.data?.message || 'Login gagal';
        setApiError(message);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {apiError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
          {apiError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
        <input
          {...register('email')}
          type="email"
          placeholder="email@example.com"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        {errors.email && (
          <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input
          {...register('password')}
          type="password"
          placeholder="••••••••"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        {errors.password && (
          <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded transition"
      >
        {isPending ? 'Masuk...' : 'Masuk'}
      </button>

      <p className="text-center text-gray-400 text-sm">
        Belum punya akun?{' '}
        <a href="/register" className="text-blue-400 hover:text-blue-300">
          Daftar di sini
        </a>
      </p>
    </form>
  );
}
