---
name: ui-page
description: Use when creating or changing a frontend page, feature view, chart, form or table in apps/web.
---
# UI page (React + Vite + Tailwind + shadcn/ui)

## Structure
apps/web/src/features/<feature>/
- api.ts          — fetch functions (typed with packages/shared)
- hooks.ts        — TanStack Query hooks (useXxxQuery / useXxxMutation), invalidate related keys on mutation
- components/     — feature components
- <Feature>Page.tsx

## Rules
- Dark theme, design tokens from src/styles/tokens.css (no hard-coded hex in components). Accent colors per pos: perpuluhan purple, kebutuhan green, dana darurat amber, investasi sky, gaya hidup pink.
- Every data view handles 3 states: loading (skeleton), empty (short message + action), error (message + retry).
- Money displayed with formatRupiah from shared; inputs accept "35rb"/"1.250.000" via shared parser.
- Forms: react-hook-form + zodResolver with shared schemas.
- Charts: Recharts, responsive container, tooltip in Rupiah.
- Admin-only pages behind <RequireRole role="ADMIN">.
- Mobile-friendly: works at 375px width.
- Bahasa Indonesia for all UI text.

## Steps
1. Check if a shadcn component exists before building custom.
2. Build api.ts → hooks.ts → components → page → route.
3. pnpm --filter web typecheck && pnpm --filter web lint
