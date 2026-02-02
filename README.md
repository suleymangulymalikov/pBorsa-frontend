# pBorsa Frontend

React + Vite frontend for pBorsa.

## Requirements

- Node.js 18+
- npm

## Setup

```bash
npm install
npm run dev
```

App runs at `http://localhost:5173`.

## Environment

Create `pBorsa-frontend/.env.local`:

```
VITE_API_BASE_URL=http://localhost:8081
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## Firebase

Firebase Auth is used for login. Configuration lives in:

```
src/lib/firebase.ts
```

Do not commit real credentials.

## Backend API

The frontend calls:

```
http://localhost:8081
```

Requests are authenticated with a Firebase ID token. The app attaches this automatically.

## Project structure

```
.github
  workflows
e2e
  tests/
src/
  api/          backend API calls
  auth/
  components/   shared UI
  layouts/
  lib/          Firebase config
  pages/        route pages
  routes/
  App.tsx
  main.tsx
```

## Features

- Auth: Firebase email/password
- Dashboard: strategy summary + portfolio stats
- Account: profile, portfolio snapshot, security, Alpaca credentials
- Market Data: quote + bars, snapshot, polling
- Strategies: create, edit name, activate/stop
- Orders: list by strategy, detail + status history
- Positions: open positions + summary

## First-time user

If Alpaca credentials are not set, the dashboard shows a prompt to configure them.
Go to Account -> Credentials and add your API key + secret.

## E2E Testing Setup (Playwright)

### Run Tests
- commands (see [package.json](./package.json))
  - `e2e:test`
  - `e2e:report`
- examples
  ```bash
  npm run e2e:test
  ```
