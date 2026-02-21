# EstimatePro PH

Formula-driven construction estimating and quotation app for Philippine design-build teams.

## Prerequisites

- Node.js 20.x (`.nvmrc` pinned)
- npm 10+
- PostgreSQL running locally

## Project Structure

- `frontend/`: Next.js 14 UI
- `server/`: Express + TypeScript API and business logic

## Install

```bash
nvm use
npm install
```

## Environment Files

Create local env files from examples:

```bash
cp server/.env.example server/.env
cp frontend/.env.local.example frontend/.env.local
```

Set values at minimum for:

- `server/.env`: `DATABASE_URL`, `JWT_SECRET`, token expiry values, `FRONTEND_URL`, `PORT`
- `frontend/.env.local`: `NEXT_PUBLIC_API_URL` (usually `http://localhost:4000`)

## Run in Development

In separate terminals:

```bash
npm run dev:server
npm run dev:frontend
```

- Frontend: `http://localhost:3000`
- Server health check: `http://localhost:4000/health`

## Quality Checks

```bash
npm run lint
npm run format:check
```

## Deployment

For manual production deployment using Supabase + Render + Vercel, see `DEPLOYMENT.md`.
