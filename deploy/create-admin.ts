/**
 * Buat / promosikan admin, atau nonaktifkan admin lama. Dijalankan DI DALAM container (lihat docs/DEPLOY.md):
 *
 *   NEW_ADMIN_EMAIL=you@domain.com NEW_ADMIN_PASSWORD='min-12-karakter' ts-node deploy/create-admin.ts
 *   ts-node deploy/create-admin.ts --deactivate admin@finance.local
 *
 * Aturan: password >= 12 karakter, email bukan domain .local. Password tidak pernah dicetak.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAdminInput(email: string | undefined, password: string | undefined): string[] {
  const errors: string[] = [];
  const e = email?.trim().toLowerCase() ?? '';
  if (!EMAIL_PATTERN.test(e)) errors.push('Email tidak valid.');
  else if (e.endsWith('.local')) errors.push('Email berakhiran .local ditolak (bukan alamat sungguhan).');
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password minimal ${MIN_PASSWORD_LENGTH} karakter.`);
  }
  return errors;
}

async function deactivate(prisma: PrismaClient, email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`User ${email} tidak ditemukan.`);
  const activeAdmins = await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', NOT: { id: user.id } } });
  if (user.role === 'ADMIN' && activeAdmins === 0) {
    throw new Error('Ditolak: ini satu-satunya admin aktif. Buat admin baru dulu.');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  console.log(`✅ ${user.email} dinonaktifkan (SUSPENDED) dan semua sesinya dicabut.`);
}

async function upsertAdmin(prisma: PrismaClient, email: string, password: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const passwordHash = await hash(password);
  const user = await prisma.user.upsert({
    where: { email: normalized },
    update: { passwordHash, role: 'ADMIN', status: 'ACTIVE', approvedAt: new Date() },
    create: { email: normalized, passwordHash, role: 'ADMIN', status: 'ACTIVE', approvedAt: new Date() },
  });
  await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  console.log(`✅ Admin siap: ${user.email}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prisma = new PrismaClient();
  try {
    const i = args.indexOf('--deactivate');
    if (i >= 0) {
      const target = args[i + 1];
      if (!target) throw new Error('Pakai: --deactivate <email>');
      await deactivate(prisma, target);
      return;
    }
    const email = process.env.NEW_ADMIN_EMAIL ?? args[0];
    const password = process.env.NEW_ADMIN_PASSWORD;
    const errors = validateAdminInput(email, password);
    if (errors.length > 0) throw new Error(errors.join(' '));
    await upsertAdmin(prisma, email as string, password as string);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('❌', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
