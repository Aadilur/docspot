import { API_PATHS } from "./endpoints";
import { apiFetch } from "./http";

export type PrescriptionGroup = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PrescriptionReport = {
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

export type PrescriptionAttachment = {
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

export type PrescriptionGroupListItem = PrescriptionGroup & {
  reportCount: number;
  latestReport: { id: string; title: string; updatedAt: string } | null;
};

export type PrescriptionGroupDetails = {
  group: PrescriptionGroup;
  reports: Array<
    PrescriptionReport & { attachments: PrescriptionAttachment[] }
  >;
};

export async function listPrescriptionGroups(params?: {
  limit?: number;
  offset?: number;
}): Promise<PrescriptionGroupListItem[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));

  const res = await apiFetch<{ ok: true; groups: PrescriptionGroupListItem[] }>(
    `${API_PATHS.mePrescriptionGroups}${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.groups;
}

export async function createPrescriptionGroupWithFirstReport(params: {
  groupTitle?: string | null;
  report: {
    title: string;
    issueDate?: string | null;
    nextAppointment?: string | null;
    doctor?: string | null;
    textNote?: string | null;
  };
}): Promise<{ group: PrescriptionGroup; report: PrescriptionReport }> {
  const res = await apiFetch<{
    ok: true;
    group: PrescriptionGroup;
    report: PrescriptionReport;
  }>(API_PATHS.mePrescriptionGroups, {
    method: "POST",
    body: JSON.stringify({
      groupTitle: params.groupTitle ?? null,
      report: params.report,
    }),
  });

  return { group: res.group, report: res.report };
}

export async function getPrescriptionGroupDetails(groupId: string): Promise<{
  group: PrescriptionGroup;
  reports: Array<
    PrescriptionReport & { attachments: PrescriptionAttachment[] }
  >;
}> {
  const res = await apiFetch<{
    ok: true;
    group: PrescriptionGroup;
    reports: Array<
      PrescriptionReport & { attachments: PrescriptionAttachment[] }
    >;
  }>(API_PATHS.mePrescriptionGroupById(groupId));

  return { group: res.group, reports: res.reports };
}

export async function patchPrescriptionGroup(params: {
  groupId: string;
  title: string | null;
}): Promise<PrescriptionGroup> {
  const res = await apiFetch<{ ok: true; group: PrescriptionGroup }>(
    API_PATHS.mePrescriptionGroupById(params.groupId),
    {
      method: "PATCH",
      body: JSON.stringify({ title: params.title }),
    },
  );
  return res.group;
}

export async function createPrescriptionReport(params: {
  groupId: string;
  title: string;
  issueDate?: string | null;
  nextAppointment?: string | null;
  doctor?: string | null;
  textNote?: string | null;
}): Promise<PrescriptionReport> {
  const res = await apiFetch<{ ok: true; report: PrescriptionReport }>(
    API_PATHS.mePrescriptionGroupReports(params.groupId),
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

export async function patchPrescriptionReport(params: {
  groupId: string;
  reportId: string;
  patch: Partial<{
    title: string;
    issueDate: string | null;
    nextAppointment: string | null;
    doctor: string | null;
    textNote: string | null;
  }>;
}): Promise<PrescriptionReport> {
  const res = await apiFetch<{ ok: true; report: PrescriptionReport }>(
    API_PATHS.mePrescriptionGroupReportById(params.groupId, params.reportId),
    {
      method: "PATCH",
      body: JSON.stringify(params.patch),
    },
  );
  return res.report;
}

export async function addPrescriptionAttachment(params: {
  groupId: string;
  reportId: string;
  key: string;
  filename?: string | null;
  contentType?: string | null;
  kind?: "file" | "audio";
}): Promise<PrescriptionAttachment> {
  const res = await apiFetch<{ ok: true; attachment: PrescriptionAttachment }>(
    API_PATHS.mePrescriptionReportAttachments(params.groupId, params.reportId),
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

export async function deletePrescriptionGroup(groupId: string): Promise<void> {
  await apiFetch<{ ok: true }>(API_PATHS.mePrescriptionGroupById(groupId), {
    method: "DELETE",
  });
}

export async function createPrescriptionShareLink(params: {
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
  }>(API_PATHS.mePrescriptionGroupShare(params.groupId), {
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

export async function getSharedPrescriptionGroup(token: string): Promise<{
  group: PrescriptionGroup;
  reports: Array<
    PrescriptionReport & { attachments: PrescriptionAttachment[] }
  >;
  expiresAt: string;
}> {
  const res = await apiFetch<{
    ok: true;
    group: PrescriptionGroup;
    reports: Array<
      PrescriptionReport & { attachments: PrescriptionAttachment[] }
    >;
    expiresAt: string;
  }>(API_PATHS.sharePrescriptionByToken(token));

  return { group: res.group, reports: res.reports, expiresAt: res.expiresAt };
}
