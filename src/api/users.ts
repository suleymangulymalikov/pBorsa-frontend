import { api } from "./client";

type MeResponse = {
  id: number;
  firebaseUid: string;
  email: string;
  displayName?: string | null;
  provider?: string | null;
};

export async function getMe() {
  return api.get<MeResponse>("/api/v1/users/me");
}
