import { api } from "./client";

export async function getMe() {
  const res = await api.get("/api/v1/users/me");
  return res.data;
}
