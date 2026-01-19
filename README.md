# pBorsa Frontend

Frontend application for the **pBorsa** project.

Built with:

- React (Vite)
- TypeScript
- Firebase Authentication
- Tailwind CSS

---

## 1. Requirements

Make sure you have installed:

- Node.js **v18+**
- npm

---

## 2. Setup & Run

```bash
npm install
npm run dev
```

The app will be available at:

```
http://localhost:5173
```

---

## 3. Firebase Authentication

Authentication is handled using **Firebase Auth**.

### Required file

Create a file:

```
src/lib/firebase.ts
```

Example structure:

```ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  appId: "...",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
```

⚠️ **Do NOT commit real Firebase credentials**
Use `.env` or local config.

---

## 4. Backend API

Backend runs on:

```
http://localhost:8081
```

Authenticated requests must include a Firebase **ID token**:

```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

The frontend automatically attaches the token using Axios interceptors.

Example endpoint:

```
GET /api/v1/users/me
```

---

## 5. Project Structure

```
src/
├── api/          # Backend API calls
├── lib/          # Firebase config
├── pages/        # Route pages
├── components/   # Reusable UI components
└── main.tsx
```

---

### Authentication flow

- Firebase Authentication on frontend
- Firebase ID token sent as:
  Authorization: Bearer <token>
- Backend verifies token and maps user by firebaseUid
