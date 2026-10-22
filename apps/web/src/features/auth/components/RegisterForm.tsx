import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RegisterSchema, RegisterInput } from 'shared';
import { useRegister } from '../hooks';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

export function RegisterForm() {
  const navigate = useNavigate();
  const { mutate: register, isPending } = useRegister();
  const [apiError, setApiError] = useState<string>('');

  const {
    register: registerField,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
  });

  const password = watch('password') || '';

  const passwordReqs = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };

  const onSubmit = (data: RegisterInput) => {
    setApiError('');
    register(data, {
      onSuccess: () => {
        navigate('/menunggu-persetujuan');
      },
      onError: (error: any) => {
        const message = error.response?.data?.message || 'Registrasi gagal';
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
          {...registerField('email')}
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
          {...registerField('password')}
          type="password"
          placeholder="••••••••"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="mt-2 space-y-1 text-xs">
          <p className={passwordReqs.minLength ? 'text-green-400' : 'text-gray-500'}>
            ✓ Minimal 8 karakter
          </p>
          <p className={passwordReqs.hasUppercase ? 'text-green-400' : 'text-gray-500'}>
            ✓ Mengandung huruf besar
          </p>
          <p className={passwordReqs.hasNumber ? 'text-green-400' : 'text-gray-500'}>
            ✓ Mengandung angka
          </p>
        </div>
        {errors.password && (
          <p className="text-red-400 text-xs mt-2">{errors.password.message}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Konfirmasi Password
        </label>
        <input
          {...registerField('passwordConfirm')}
          type="password"
          placeholder="••••••••"
          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        {errors.passwordConfirm && (
          <p className="text-red-400 text-xs mt-1">{errors.passwordConfirm.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded transition"
      >
        {isPending ? 'Mendaftar...' : 'Daftar'}
      </button>

      <p className="text-center text-gray-400 text-sm">
        Sudah punya akun?{' '}
        <a href="/login" className="text-blue-400 hover:text-blue-300">
          Masuk di sini
        </a>
      </p>
    </form>
  );
}
