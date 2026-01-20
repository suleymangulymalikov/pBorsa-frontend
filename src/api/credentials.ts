import { api } from "./client";

export type CredentialsRegistrationRequest = {
  apiKey: string;
  secretKey: string;
  paperTrading: boolean;
};

export async function getCredentialsStatus(userId: number) {
  return api.get<boolean>(`/api/v1/credentials/${userId}/status`);
}

export async function registerCredentials(
  userId: number,
  req: CredentialsRegistrationRequest,
) {
  return api.post<boolean>(`/api/v1/credentials/${userId}`, req);
}

export async function deactivateCredentials(userId: number) {
  return api.delete<void>(`/api/v1/credentials/${userId}`);
}
