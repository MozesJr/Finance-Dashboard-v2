import { RegisterForm } from './components/RegisterForm';

export function RegisterPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Dashboard Keuangan</h1>
          <p className="text-gray-400">Buat akun baru</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
