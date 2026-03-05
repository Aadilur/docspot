import { apiFetch } from "./http";

export type CareerApplication = {
  id: string;
  jobId: string;
  jobSlug: string;
  status: string;
  userMessageLimit: number;
  cvFilename: string | null;
  cvContentType: string | null;
  cvSizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type CareerApplicationMessage = {
  id: string;
  applicationId: string;
  senderRole: "user" | "admin";
  message: string;
  createdAt: string;
};

export async function applyToCareerJob(params: {
  slug: string;
  cvKey: string;
  cvFilename: string | null;
  cvContentType: string | null;
  message: string;
}): Promise<CareerApplication> {
  const slug = typeof params.slug === "string" ? params.slug.trim() : "";
  if (!slug) throw new Error("invalid slug");

  const res = await apiFetch<{ ok: true; application: CareerApplication }>(
    `/careers/jobs/${encodeURIComponent(slug)}/applications`,
    {
      method: "POST",
      body: JSON.stringify({
        cvKey: params.cvKey,
        cvFilename: params.cvFilename,
        cvContentType: params.cvContentType,
        message: params.message,
      }),
    },
  );

  return res.application;
}

export async function getMyCareerApplicationForJob(params: {
  slug: string;
}): Promise<CareerApplication | null> {
  const slug = typeof params.slug === "string" ? params.slug.trim() : "";
  if (!slug) return null;

  const res = await apiFetch<{
    ok: true;
    application: CareerApplication | null;
  }>(`/careers/jobs/${encodeURIComponent(slug)}/applications/my`);

  return res.application ?? null;
}

export async function listCareerApplicationMessages(params: {
  applicationId: string;
  afterCreatedAt?: string | null;
}): Promise<CareerApplicationMessage[]> {
  const applicationId =
    typeof params.applicationId === "string" ? params.applicationId.trim() : "";
  if (!applicationId) return [];

  const after =
    typeof params.afterCreatedAt === "string"
      ? params.afterCreatedAt.trim()
      : "";
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";

  const res = await apiFetch<{
    ok: true;
    messages: CareerApplicationMessage[];
  }>(
    `/careers/applications/${encodeURIComponent(applicationId)}/messages${qs}`,
  );

  return Array.isArray(res?.messages) ? res.messages : [];
}

export async function sendCareerApplicationMessage(params: {
  applicationId: string;
  message: string;
}): Promise<CareerApplicationMessage> {
  const applicationId =
    typeof params.applicationId === "string" ? params.applicationId.trim() : "";
  if (!applicationId) throw new Error("invalid applicationId");

  const res = await apiFetch<{ ok: true; message: CareerApplicationMessage }>(
    `/careers/applications/${encodeURIComponent(applicationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ message: params.message }),
    },
  );

  return res.message;
}

export async function getCareerApplicationCvUrl(params: {
  applicationId: string;
}): Promise<{
  url: string;
  expiresInSeconds: number;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number;
}> {
  const applicationId =
    typeof params.applicationId === "string" ? params.applicationId.trim() : "";
  if (!applicationId) throw new Error("invalid applicationId");

  const res = await apiFetch<{
    ok: true;
    url: string;
    expiresInSeconds: number;
    filename: string | null;
    contentType: string | null;
    sizeBytes: number;
  }>(`/careers/applications/${encodeURIComponent(applicationId)}/cv-url`);

  return {
    url: res.url,
    expiresInSeconds: res.expiresInSeconds,
    filename: res.filename,
    contentType: res.contentType,
    sizeBytes: res.sizeBytes,
  };
}
