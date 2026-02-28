export type AuthLevel = "public" | "auth" | "admin";

export type ApiEndpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: AuthLevel;
  description: string;
};

// Centralized backend API paths used across the frontend.
export const API_PATHS = {
  root: "/",

  health: "/health",
  healthDb: "/health/db",
  healthStorage: "/health/storage",

  uploadsPresign: "/uploads/presign",

  me: "/me",
  mePhotoPresign: "/me/photo/presign",
  mePhotoConfirm: "/me/photo/confirm",
  mePhotoRedirect: "/me/photo",
  mePhotoUrl: "/me/photo/url",
  meStorage: "/me/storage",
  meStoragePresign: "/me/storage/presign",
  meStorageConfirm: "/me/storage/confirm",
  meStorageDelete: "/me/storage/delete",
  meStorageDeletePrefix: "/me/storage/delete-prefix",
  meStorageUsage: "/me/storage/usage",

  mePrescriptionGroups: "/me/prescription-groups",
  mePrescriptionGroupById: (id: string) => `/me/prescription-groups/${id}`,
  mePrescriptionGroupReports: (id: string) =>
    `/me/prescription-groups/${id}/reports`,
  mePrescriptionGroupReportById: (id: string, reportId: string) =>
    `/me/prescription-groups/${id}/reports/${reportId}`,
  mePrescriptionReportAttachments: (id: string, reportId: string) =>
    `/me/prescription-groups/${id}/reports/${reportId}/attachments`,
  mePrescriptionGroupShare: (id: string) =>
    `/me/prescription-groups/${id}/share`,

  sharePrescriptionByToken: (token: string) => `/share/prescriptions/${token}`,

  users: "/users",
  usersByProvider: "/users/by-provider",
  usersUpsert: "/users/upsert",
  userById: (id: string) => `/users/${id}`,
  userPhotoPresign: (id: string) => `/users/${id}/photo/presign`,
  userPhotoRedirect: (id: string) => `/users/${id}/photo`,
} as const;

export const API_ENDPOINTS: ApiEndpoint[] = [
  {
    method: "GET",
    path: API_PATHS.root,
    auth: "public",
    description: "Liveness",
  },
  {
    method: "GET",
    path: API_PATHS.health,
    auth: "public",
    description: "Service health",
  },
  {
    method: "GET",
    path: API_PATHS.healthDb,
    auth: "public",
    description: "Database connectivity",
  },
  {
    method: "GET",
    path: API_PATHS.healthStorage,
    auth: "public",
    description: "Storage config status",
  },

  {
    method: "POST",
    path: API_PATHS.uploadsPresign,
    auth: "auth",
    description: "Presign user drive upload (quota-checked)",
  },

  {
    method: "GET",
    path: API_PATHS.me,
    auth: "auth",
    description: "Get or create current user",
  },
  {
    method: "PATCH",
    path: API_PATHS.me,
    auth: "auth",
    description: "Update current user",
  },
  {
    method: "POST",
    path: API_PATHS.mePhotoPresign,
    auth: "auth",
    description: "Presign profile photo upload",
  },
  {
    method: "POST",
    path: API_PATHS.mePhotoConfirm,
    auth: "auth",
    description: "Confirm profile photo upload and update usage",
  },
  {
    method: "GET",
    path: API_PATHS.mePhotoRedirect,
    auth: "auth",
    description: "Redirect to signed photo URL",
  },
  {
    method: "GET",
    path: API_PATHS.mePhotoUrl,
    auth: "auth",
    description: "Return signed photo URL (JSON)",
  },

  {
    method: "GET",
    path: API_PATHS.meStorage,
    auth: "auth",
    description: "Get DB-tracked storage usage",
  },
  {
    method: "POST",
    path: API_PATHS.meStoragePresign,
    auth: "auth",
    description: "Presign drive upload (quota-checked)",
  },
  {
    method: "POST",
    path: API_PATHS.meStorageConfirm,
    auth: "auth",
    description: "Confirm upload and update usage counters",
  },
  {
    method: "POST",
    path: API_PATHS.meStorageDelete,
    auth: "auth",
    description: "Delete objects and decrement usage counters",
  },
  {
    method: "POST",
    path: API_PATHS.meStorageDeletePrefix,
    auth: "auth",
    description: "Delete a folder/prefix (batched)",
  },

  {
    method: "GET",
    path: API_PATHS.mePrescriptionGroups,
    auth: "auth",
    description: "List prescription groups",
  },
  {
    method: "POST",
    path: API_PATHS.mePrescriptionGroups,
    auth: "auth",
    description: "Create prescription group with first report",
  },
  {
    method: "GET",
    path: "/me/prescription-groups/:id",
    auth: "auth",
    description: "Get prescription group details",
  },
  {
    method: "PATCH",
    path: "/me/prescription-groups/:id",
    auth: "auth",
    description: "Update prescription group title",
  },
  {
    method: "DELETE",
    path: "/me/prescription-groups/:id",
    auth: "auth",
    description: "Delete prescription group (and attachments)",
  },
  {
    method: "POST",
    path: "/me/prescription-groups/:id/reports",
    auth: "auth",
    description: "Create prescription report",
  },
  {
    method: "PATCH",
    path: "/me/prescription-groups/:id/reports/:reportId",
    auth: "auth",
    description: "Update prescription report",
  },
  {
    method: "POST",
    path: "/me/prescription-groups/:id/reports/:reportId/attachments",
    auth: "auth",
    description: "Attach confirmed drive object to report",
  },
  {
    method: "POST",
    path: "/me/prescription-groups/:id/share",
    auth: "auth",
    description: "Create share link for group",
  },
  {
    method: "GET",
    path: "/share/prescriptions/:token",
    auth: "public",
    description: "Public read-only shared prescription group",
  },

  {
    method: "GET",
    path: API_PATHS.meStorageUsage,
    auth: "auth",
    description:
      "Compute bucket usage by scanning S3 (expensive; reconciliation)",
  },

  {
    method: "GET",
    path: API_PATHS.users,
    auth: "admin",
    description: "List users",
  },
  {
    method: "GET",
    path: "/users/:id",
    auth: "admin",
    description: "Get user by id",
  },
  {
    method: "GET",
    path: API_PATHS.usersByProvider,
    auth: "admin",
    description: "Find user by provider identity",
  },
  {
    method: "POST",
    path: API_PATHS.users,
    auth: "admin",
    description: "Create user",
  },
  {
    method: "POST",
    path: API_PATHS.usersUpsert,
    auth: "admin",
    description: "Upsert user",
  },
  {
    method: "PATCH",
    path: "/users/:id",
    auth: "admin",
    description: "Update user",
  },
  {
    method: "DELETE",
    path: "/users/:id",
    auth: "admin",
    description: "Delete user",
  },
  {
    method: "POST",
    path: "/users/:id/photo/presign",
    auth: "admin",
    description: "Presign user photo upload",
  },
  {
    method: "GET",
    path: "/users/:id/photo",
    auth: "admin",
    description: "Redirect to signed user photo URL",
  },
];
