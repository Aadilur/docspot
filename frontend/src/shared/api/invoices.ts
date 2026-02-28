import { API_PATHS } from "./endpoints";
import { apiFetch } from "./http";

export type InvoiceGroup = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceReport = {
  id: string;
  groupId: string;
  userId: string;
  title: string;
  issueDate: string | null;
  nextAppointment: string | null;
  doctor: string | null;
  textNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceAttachment = {
  id: string;
  reportId: string;
  userId: string;
  key: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number;
  kind: "file" | "audio";
  createdAt: string;
  updatedAt: string;
  url?: string | null;
  urlExpiresInSeconds?: number | null;
};

export type InvoiceGroupListItem = InvoiceGroup & {
  reportCount: number;
  latestReport: { id: string; title: string; updatedAt: string } | null;
};

export async function listInvoiceGroups(params?: {
  limit?: number;
  offset?: number;
}): Promise<InvoiceGroupListItem[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));

  const res = await apiFetch<{ ok: true; groups: InvoiceGroupListItem[] }>(
    `${API_PATHS.meInvoiceGroups}${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.groups;
}

export async function createInvoiceGroupWithFirstReport(params: {
  groupTitle?: string | null;
  report: {
    title: string;
    issueDate?: string | null;
    nextAppointment?: string | null;
    doctor?: string | null;
    textNote?: string | null;
  };
}): Promise<{ group: InvoiceGroup; report: InvoiceReport }> {
  const res = await apiFetch<{
    ok: true;
    group: InvoiceGroup;
    report: InvoiceReport;
  }>(API_PATHS.meInvoiceGroups, {
    method: "POST",
    body: JSON.stringify({
      groupTitle: params.groupTitle ?? null,
      report: params.report,
    }),
  });

  return { group: res.group, report: res.report };
}

export async function getInvoiceGroupDetails(groupId: string): Promise<{
  group: InvoiceGroup;
  reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
}> {
  const res = await apiFetch<{
    ok: true;
    group: InvoiceGroup;
    reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
  }>(API_PATHS.meInvoiceGroupById(groupId));

  return { group: res.group, reports: res.reports };
}

export async function patchInvoiceGroup(params: {
  groupId: string;
  title: string | null;
}): Promise<InvoiceGroup> {
  const res = await apiFetch<{ ok: true; group: InvoiceGroup }>(
    API_PATHS.meInvoiceGroupById(params.groupId),
    { method: "PATCH", body: JSON.stringify({ title: params.title }) },
  );
  return res.group;
}

export async function createInvoiceReport(params: {
  groupId: string;
  title: string;
  issueDate?: string | null;
  nextAppointment?: string | null;
  doctor?: string | null;
  textNote?: string | null;
}): Promise<InvoiceReport> {
  const res = await apiFetch<{ ok: true; report: InvoiceReport }>(
    API_PATHS.meInvoiceGroupReports(params.groupId),
    {
      method: "POST",
      body: JSON.stringify({
        title: params.title,
        issueDate: params.issueDate ?? null,
        nextAppointment: params.nextAppointment ?? null,
        doctor: params.doctor ?? null,
        textNote: params.textNote ?? null,
      }),
    },
  );
  return res.report;
}

export async function patchInvoiceReport(params: {
  groupId: string;
  reportId: string;
  patch: Partial<{
    title: string;
    issueDate: string | null;
    nextAppointment: string | null;
    doctor: string | null;
    textNote: string | null;
  }>;
}): Promise<InvoiceReport> {
  const res = await apiFetch<{ ok: true; report: InvoiceReport }>(
    API_PATHS.meInvoiceGroupReportById(params.groupId, params.reportId),
    { method: "PATCH", body: JSON.stringify(params.patch) },
  );
  return res.report;
}

export async function addInvoiceAttachment(params: {
  groupId: string;
  reportId: string;
  key: string;
  filename?: string | null;
  contentType?: string | null;
  kind?: "file" | "audio";
}): Promise<InvoiceAttachment> {
  const res = await apiFetch<{ ok: true; attachment: InvoiceAttachment }>(
    API_PATHS.meInvoiceReportAttachments(params.groupId, params.reportId),
    {
      method: "POST",
      body: JSON.stringify({
        key: params.key,
        filename: params.filename ?? null,
        contentType: params.contentType ?? null,
        kind: params.kind ?? "file",
      }),
    },
  );
  return res.attachment;
}

export async function deleteInvoiceGroup(groupId: string): Promise<void> {
  await apiFetch<{ ok: true }>(API_PATHS.meInvoiceGroupById(groupId), {
    method: "DELETE",
  });
}

export async function createInvoiceShareLink(params: {
  groupId: string;
  ttlSeconds: number;
}): Promise<{
  token: string;
  expiresAt: string;
  sharePath: string;
  limitPer24h: number;
}> {
  const res = await apiFetch<{
    ok: true;
    token: string;
    expiresAt: string;
    sharePath: string;
    limitPer24h: number;
  }>(API_PATHS.meInvoiceGroupShare(params.groupId), {
    method: "POST",
    body: JSON.stringify({ ttlSeconds: params.ttlSeconds }),
  });

  return {
    token: res.token,
    expiresAt: res.expiresAt,
    sharePath: res.sharePath,
    limitPer24h: res.limitPer24h,
  };
}

export async function getSharedInvoiceGroup(token: string): Promise<{
  group: InvoiceGroup;
  reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
  expiresAt: string;
}> {
  const res = await apiFetch<{
    ok: true;
    group: InvoiceGroup;
    reports: Array<InvoiceReport & { attachments: InvoiceAttachment[] }>;
    expiresAt: string;
  }>(API_PATHS.shareInvoiceByToken(token));

  return { group: res.group, reports: res.reports, expiresAt: res.expiresAt };
}
