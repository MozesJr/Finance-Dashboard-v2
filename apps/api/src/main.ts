import 'reflect-metadata';
import './bootstrap';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { allowedOrigin, shouldWarnInsecureCookie } from './common/runtime-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = (key: string) => process.env[key];

  // Trust proxy only if explicitly enabled (for production behind reverse proxy)
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  if (shouldWarnInsecureCookie(env)) {
    new Logger('Bootstrap').warn(
      'COOKIE_SECURE=false di production: cookie sesi dikirim lewat HTTP biasa. Pasang HTTPS lalu set COOKIE_SECURE=true.',
    );
  }

  // Middleware
  app.use(cookieParser());

  // CORS untuk web app (APP_URL, default http://localhost:5173)
  app.enableCors({
    origin: allowedOrigin(env),
    credentials: true,
  });

  // Global prefix
  app.setGlobalPrefix('api');

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}/api`);
  });
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
