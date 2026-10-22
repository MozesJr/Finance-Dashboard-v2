import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/me'];

let refreshPromise: Promise<string | null> | null = null;

const http = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      const requestUrl = originalRequest.url || '';

      // Don't refresh for auth endpoints
      if (NO_REFRESH_PATHS.some((path) => requestUrl.includes(path))) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // Single-flight refresh
      if (!refreshPromise) {
        refreshPromise = http.post('/auth/refresh').then(
          () => {
            refreshPromise = null;
            return null;
          },
          () => {
            refreshPromise = null;
            // Clear auth state and redirect to login
            window.location.href = '/login';
            return null;
          }
        );
      }

      await refreshPromise;
      return http(originalRequest);
    }

    return Promise.reject(error);
  }
);

export default http;
