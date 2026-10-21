import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

interface CategorySeed {
  id: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon: string;
  color: string;
}

const DEFAULT_CATEGORIES: CategorySeed[] = [
  // EXPENSE
  { id: 'cat-expense-makan', name: 'Makan & Minum', type: 'EXPENSE', icon: '🍽️', color: '#FF6B6B' },
  { id: 'cat-expense-transport', name: 'Transportasi', type: 'EXPENSE', icon: '🚗', color: '#4ECDC4' },
  { id: 'cat-expense-kos', name: 'Kos/Tempat Tinggal', type: 'EXPENSE', icon: '🏠', color: '#95A5A6' },
  { id: 'cat-expense-listrik', name: 'Listrik & Air', type: 'EXPENSE', icon: '⚡', color: '#F39C12' },
  { id: 'cat-expense-internet', name: 'Internet & Pulsa', type: 'EXPENSE', icon: '📱', color: '#3498DB' },
  { id: 'cat-expense-belanja', name: 'Belanja Kebutuhan', type: 'EXPENSE', icon: '🛒', color: '#E74C3C' },
  { id: 'cat-expense-kesehatan', name: 'Kesehatan', type: 'EXPENSE', icon: '⚕️', color: '#2ECC71' },
  { id: 'cat-expense-hiburan', name: 'Hiburan', type: 'EXPENSE', icon: '🎬', color: '#9B59B6' },
  { id: 'cat-expense-hobi', name: 'Hobi', type: 'EXPENSE', icon: '🎨', color: '#1ABC9C' },
  { id: 'cat-expense-donasi', name: 'Perpuluhan/Donasi', type: 'EXPENSE', icon: '❤️', color: '#E91E63' },
  { id: 'cat-expense-pendidikan', name: 'Pendidikan', type: 'EXPENSE', icon: '📚', color: '#34495E' },
  { id: 'cat-expense-lainnya', name: 'Lain-lain', type: 'EXPENSE', icon: '📌', color: '#BDC3C7' },
  // INCOME
  { id: 'cat-income-gaji', name: 'Gaji', type: 'INCOME', icon: '💼', color: '#27AE60' },
  { id: 'cat-income-bonus', name: 'Bonus', type: 'INCOME', icon: '🎁', color: '#F1C40F' },
  { id: 'cat-income-freelance', name: 'Freelance/Proyek', type: 'INCOME', icon: '💻', color: '#16A085' },
  { id: 'cat-income-investasi', name: 'Hasil Investasi', type: 'INCOME', icon: '📈', color: '#2980B9' },
  { id: 'cat-income-lainnya', name: 'Lain-lain', type: 'INCOME', icon: '💰', color: '#8E44AD' },
];

async function main() {
  console.log('🌱 Starting seed...');

  // Create admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@finance.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'InitialPassword123!';

  const passwordHash = await argon2.hash(adminPassword);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      approvedAt: new Date(),
    },
  });

  console.log(`✅ Admin user created/updated: ${admin.email}`);

  // Create default categories
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
      },
      create: {
        id: cat.id,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        isSystem: true,
      },
    });
  }

  console.log(`✅ ${DEFAULT_CATEGORIES.length} default categories created/updated`);

  console.log('🎉 Seed completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
