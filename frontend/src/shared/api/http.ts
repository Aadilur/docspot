import { getFirebaseAuth, isFirebaseConfigured } from "../firebase/firebase";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  "https://api.docspot.app";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  let idToken: string | null = null;
  if (isFirebaseConfigured()) {
    try {
      const user = getFirebaseAuth().currentUser;
      idToken = user ? await user.getIdToken() : null;
    } catch {
      idToken = null;
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const message =
      typeof (data as any)?.error === "string"
        ? (data as any).error
        : typeof (data as any)?.message === "string"
          ? (data as any).message
          : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data as T;
}
