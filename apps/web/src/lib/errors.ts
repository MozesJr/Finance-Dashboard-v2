import { isAxiosError } from 'axios';

interface ApiErrorBody {
  message?: string | string[];
  errors?: Array<{ field: string; message: string }>;
}

/** Ambil pesan error ramah (Bahasa Indonesia dari API) dari error axios. */
export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  if (isAxiosError<ApiErrorBody>(error)) {
    const body = error.response?.data;
    if (body?.errors?.length) return body.errors.map((e) => e.message).join('. ');
    if (typeof body?.message === 'string') return body.message;
    if (Array.isArray(body?.message)) return body.message.join('. ');
    if (!error.response) return 'Tidak dapat terhubung ke server.';
  }
  return fallback;
}
