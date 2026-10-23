/** Pesan error ramah dari exception NestJS/umum (tanpa membocorkan detail internal). */
export function getErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: { message?: unknown } }).response;
    if (response && typeof response.message === 'string') return response.message;
    if (response && Array.isArray(response.message)) return response.message.join('. ');
  }
  return 'terjadi kesalahan';
}
