# shredintel — Botscrew Handoff

GSB Analytics 2.0: React components for the per-bot analytics page at `/admin/bot/:botId/analytics`.

## What this repo is

A self-contained component library you can drop into the existing CRA admin dashboard. Each chart is a standalone React + TypeScript component with:

- A typed props contract (see `src/types/analytics.ts`)
- A Storybook story with sample data (see `src/components/*/`)
- No backend dependencies — you wire your API to the props

## Stack

- React 19 + TypeScript
- Vite (dev) — your CRA app keeps its CRA build
- Recharts (charts)
- Tailwind v3 (utility CSS — re-skin freely with your MUI theme)
- Storybook (component preview and prop docs)

## Integration

1. Copy `src/components/<ComponentName>/` into your repo.
2. Copy `src/types/analytics.ts` to keep prop types in sync.
3. Replace fixture imports with API data of the same shape.
4. Re-theme via Tailwind classes or wrap with your own MUI theme.

## Running locally

```bash
npm install
npm run dev          # Vite dev preview of the assembled page
npm run storybook    # Component-by-component preview (recommended for review)
```

## API contract

See `src/types/analytics.ts` for the canonical shapes each component expects.
Each one corresponds to a section of the current Analytics page (active users,
conversation coverage, time-of-day, ratings, funnels) plus any 2.0 additions
we agree on.

## Open questions for Botscrew

_To be filled in once we align on scope._
