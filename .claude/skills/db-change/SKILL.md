---
name: db-change
description: Use when adding or changing database tables, columns, relations, enums or seed data (Prisma schema in apps/api/prisma).
---
# Database change (Prisma + PostgreSQL)

## Conventions
- Table names snake_case plural via @@map; model names PascalCase singular.
- Every model: id String @id @default(uuid()), createdAt, updatedAt @updatedAt.
- User-owned models: userId String + relation to User (onDelete: Cascade) + @@index([userId]).
- Money columns: BigInt (rupiah, no decimals). NEVER Float/Decimal for amounts.
- Percentages: Int (0-100). Dates of transactions: DateTime @db.Date.
- Use enums for fixed sets (Role, UserStatus, TxType, TxSource, TxStatus, GoalType).
- Soft delete only where explicitly needed (deletedAt DateTime?).

## Steps
1. Edit apps/api/prisma/schema.prisma.
2. pnpm --filter api prisma migrate dev --name <short_snake_case_description>
3. If defaults/reference data changed, update prisma/seed.ts (idempotent: use upsert).
4. Update matching Zod schemas in packages/shared.
5. pnpm --filter api typecheck
Never edit an already-applied migration file; create a new one.
