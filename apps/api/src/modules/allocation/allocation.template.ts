import { AllocationKind } from '@prisma/client';

export interface TemplateItem {
  name: string;
  description: string;
  kind: AllocationKind;
  percent: { 1: number; 2: number };
  color: string;
  icon: string;
  /** ID kategori sistem (seed). */
  categoryIds: string[];
  /** Untuk pos SAVING: tipe goal yang dihubungkan. */
  goalType?: 'EMERGENCY' | 'INVESTMENT';
}

/** Template bawaan. Fase 2: Dana Darurat 0%, Investasi 30%. */
export const ALLOCATION_TEMPLATE: TemplateItem[] = [
  {
    name: 'Perpuluhan',
    description: 'Persembahan dan donasi rutin',
    kind: 'EXPENSE',
    percent: { 1: 10, 2: 10 },
    color: '#A855F7',
    icon: '🙏',
    categoryIds: ['cat-expense-donasi'],
  },
  {
    name: 'Kebutuhan Primer',
    description: 'Makan, tempat tinggal, listrik & air, internet, transport, belanja kebutuhan',
    kind: 'EXPENSE',
    percent: { 1: 45, 2: 45 },
    color: '#4ADE80',
    icon: '🏠',
    categoryIds: [
      'cat-expense-makan',
      'cat-expense-kos',
      'cat-expense-listrik',
      'cat-expense-internet',
      'cat-expense-transport',
      'cat-expense-belanja',
    ],
  },
  {
    name: 'Dana Darurat',
    description: 'Isi dana darurat sampai target tercapai',
    kind: 'SAVING',
    percent: { 1: 15, 2: 0 },
    color: '#FBBF24',
    icon: '🛟',
    categoryIds: [],
    goalType: 'EMERGENCY',
  },
  {
    name: 'Investasi',
    description: 'Dana untuk investasi jangka panjang',
    kind: 'SAVING',
    percent: { 1: 15, 2: 30 },
    color: '#38BDF8',
    icon: '📈',
    categoryIds: [],
    goalType: 'INVESTMENT',
  },
  {
    name: 'Gaya Hidup & Hiburan',
    description: 'Hiburan dan hobi',
    kind: 'EXPENSE',
    percent: { 1: 15, 2: 15 },
    color: '#F472B6',
    icon: '🎉',
    categoryIds: ['cat-expense-hiburan', 'cat-expense-hobi'],
  },
];
