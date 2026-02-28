import { API_PATHS } from "./endpoints";
import { apiFetch } from "./http";

export type ObjectGroup = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ObjectReport = {
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

export type ObjectAttachment = {
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

export type ObjectGroupListItem = ObjectGroup & {
  reportCount: number;
  latestReport: { id: string; title: string; updatedAt: string } | null;
};

export async function listObjectGroups(params?: {
  limit?: number;
  offset?: number;
}): Promise<ObjectGroupListItem[]> {
  const qs = new URLSearchParams();
  if (typeof params?.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params?.offset === "number")
    qs.set("offset", String(params.offset));

  const res = await apiFetch<{ ok: true; groups: ObjectGroupListItem[] }>(
    `${API_PATHS.meObjectGroups}${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.groups;
}

export async function createObjectGroupWithFirstReport(params: {
  groupTitle?: string | null;
  report: {
    title: string;
    issueDate?: string | null;
    nextAppointment?: string | null;
    doctor?: string | null;
    textNote?: string | null;
  };
}): Promise<{ group: ObjectGroup; report: ObjectReport }> {
  const res = await apiFetch<{
    ok: true;
    group: ObjectGroup;
    report: ObjectReport;
  }>(API_PATHS.meObjectGroups, {
    method: "POST",
    body: JSON.stringify({
      groupTitle: params.groupTitle ?? null,
      report: params.report,
    }),
  });

  return { group: res.group, report: res.report };
}

export async function getObjectGroupDetails(groupId: string): Promise<{
  group: ObjectGroup;
  reports: Array<ObjectReport & { attachments: ObjectAttachment[] }>;
}> {
  const res = await apiFetch<{
    ok: true;
    group: ObjectGroup;
    reports: Array<ObjectReport & { attachments: ObjectAttachment[] }>;
  }>(API_PATHS.meObjectGroupById(groupId));

  return { group: res.group, reports: res.reports };
}

export async function patchObjectGroup(params: {
  groupId: string;
  title: string | null;
}): Promise<ObjectGroup> {
  const res = await apiFetch<{ ok: true; group: ObjectGroup }>(
    API_PATHS.meObjectGroupById(params.groupId),
    { method: "PATCH", body: JSON.stringify({ title: params.title }) },
  );
  return res.group;
}

export async function createObjectReport(params: {
  groupId: string;
  title: string;
  issueDate?: string | null;
  nextAppointment?: string | null;
  doctor?: string | null;
  textNote?: string | null;
}): Promise<ObjectReport> {
  const res = await apiFetch<{ ok: true; report: ObjectReport }>(
    API_PATHS.meObjectGroupReports(params.groupId),
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

export async function patchObjectReport(params: {
  groupId: string;
  reportId: string;
  patch: Partial<{
    title: string;
    issueDate: string | null;
    nextAppointment: string | null;
    doctor: string | null;
    textNote: string | null;
  }>;
}): Promise<ObjectReport> {
  const res = await apiFetch<{ ok: true; report: ObjectReport }>(
    API_PATHS.meObjectGroupReportById(params.groupId, params.reportId),
    { method: "PATCH", body: JSON.stringify(params.patch) },
  );
  return res.report;
}

export async function addObjectAttachment(params: {
  groupId: string;
  reportId: string;
  key: string;
  filename?: string | null;
  contentType?: string | null;
  kind?: "file" | "audio";
}): Promise<ObjectAttachment> {
  const res = await apiFetch<{ ok: true; attachment: ObjectAttachment }>(
    API_PATHS.meObjectReportAttachments(params.groupId, params.reportId),
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

export async function deleteObjectGroup(groupId: string): Promise<void> {
  await apiFetch<{ ok: true }>(API_PATHS.meObjectGroupById(groupId), {
    method: "DELETE",
  });
}

export async function createObjectShareLink(params: {
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
  }>(API_PATHS.meObjectGroupShare(params.groupId), {
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

export async function getSharedObjectGroup(token: string): Promise<{
  group: ObjectGroup;
  reports: Array<ObjectReport & { attachments: ObjectAttachment[] }>;
  expiresAt: string;
}> {
  const res = await apiFetch<{
    ok: true;
    group: ObjectGroup;
    reports: Array<ObjectReport & { attachments: ObjectAttachment[] }>;
    expiresAt: string;
  }>(API_PATHS.shareObjectByToken(token));

  return { group: res.group, reports: res.reports, expiresAt: res.expiresAt };
}
