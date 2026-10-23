type EnvGetter = (key: string) => string | undefined;

/**
 * Flag `Secure` cookie. COOKIE_SECURE ('true' | 'false') menang bila diset;
 * kalau tidak, default aman: true di production.
 */
export function isCookieSecure(get: EnvGetter): boolean {
  const explicit = get('COOKIE_SECURE')?.trim().toLowerCase();
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  return get('NODE_ENV') === 'production';
}

/** True bila production berjalan tanpa Secure cookie (mis. deploy HTTP tanpa proxy). */
export function shouldWarnInsecureCookie(get: EnvGetter): boolean {
  return get('NODE_ENV') === 'production' && !isCookieSecure(get);
}

/** Origin web yang diizinkan CORS; APP_URL tanpa trailing slash, default dev Vite. */
export function allowedOrigin(get: EnvGetter): string {
  const url = get('APP_URL')?.trim();
  return url ? url.replace(/\/+$/, '') : 'http://localhost:5173';
}
