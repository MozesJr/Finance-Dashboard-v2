---
name: new-module
description: Use when creating a new backend domain module (NestJS) in apps/api/src/modules, e.g. wallets, budgets, recurring, savings.
---
# New backend module

## Files (apps/api/src/modules/<domain>/)
- <domain>.module.ts      — imports PrismaModule, provides service + repository, exports service
- <domain>.controller.ts  — HTTP only: parse/validate input, call service, return DTO. No Prisma, no business logic.
- <domain>.service.ts     — business logic, class with constructor injection of repository (and other services)
- <domain>.repository.ts  — ONLY layer that touches PrismaService
- dto/                    — re-export Zod schemas from packages/shared; use ZodValidationPipe
- <domain>.service.spec.ts — unit test with mocked repository

## Rules
- userId always comes from @CurrentUser() (JWT), never from body/query.
- Every repository method for user-owned data takes userId as first argument and filters by it.
- Money is bigint. Serialize to string in responses; parse back with shared money utils.
- Throw NestJS exceptions (NotFoundException, ForbiddenException, BadRequestException) from service, never return null for "not found".
- Register the module in app.module.ts.
- Protect routes with JwtAuthGuard (global) and @Roles('ADMIN') only for /admin/*.

## Steps
1. Read the existing transactions module as reference pattern before writing.
2. Add/confirm Zod schemas in packages/shared/src/schemas/<domain>.ts.
3. If the DB needs changes, follow the db-change skill first.
4. Write repository → service → controller → module → spec.
5. Run: pnpm --filter api typecheck && pnpm --filter api test
