import { putWithProgress, type UploadProgress } from "./xhrPut";

export type UploadTaskState =
  | "queued"
  | "uploading"
  | "finalizing"
  | "done"
  | "error"
  | "canceled";

export type UploadTask = {
  id: string;
  label: string;
  createdAt: number;
  state: UploadTaskState;
  progress: UploadProgress;
  errorMessage?: string;
  cancel?: () => void;
};

type Listener = () => void;

type UploadStore = {
  tasks: UploadTask[];
  subscribe: (listener: Listener) => () => void;
  getSnapshot: () => UploadTask[];
  startPut: (params: {
    label: string;
    url: string;
    body: Blob;
    contentType: string;
    onFinalize?: () => Promise<void>;
  }) => UploadTask;
  dismiss: (id: string) => void;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const listeners = new Set<Listener>();
let tasks: UploadTask[] = [];

function emit() {
  for (const l of listeners) l();
}

function upsert(id: string, patch: Partial<UploadTask>) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tasks = tasks.map((t, i) => (i === idx ? { ...t, ...patch } : t));
  emit();
}

export const uploadStore: UploadStore = {
  tasks: [],

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot() {
    return tasks;
  },

  dismiss(id) {
    tasks = tasks.filter((t) => t.id !== id);
    emit();
  },

  startPut({ label, url, body, contentType, onFinalize }) {
    const id = newId();
    const createdAt = Date.now();

    const task: UploadTask = {
      id,
      label,
      createdAt,
      state: "queued",
      progress: {
        loadedBytes: 0,
        totalBytes: Math.max(0, body.size || 0),
        percent: 0,
        speedBps: 0,
        etaSeconds: null,
      },
    };

    tasks = [task, ...tasks].slice(0, 3);
    emit();

    const { promise, abort } = putWithProgress({
      url,
      body,
      contentType,
      onState: (s) => {
        if (s === "starting" || s === "uploading") {
          upsert(id, { state: "uploading" });
        }
        if (s === "done") {
          upsert(id, { state: "finalizing" });
        }
      },
      onProgress: (p) => {
        upsert(id, { progress: p });
      },
    });

    upsert(id, { cancel: () => abort() });

    promise
      .then(async () => {
        if (onFinalize) await onFinalize();
        upsert(id, { state: "done" });

        // Auto-dismiss after a bit so header doesn't get cluttered.
        window.setTimeout(() => {
          const stillThere = tasks.some((t) => t.id === id);
          if (stillThere) {
            // Keep errors; clear successful ones.
            const t = tasks.find((x) => x.id === id);
            if (t?.state === "done") uploadStore.dismiss(id);
          }
        }, 2500);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Upload failed";
        const state: UploadTaskState =
          message === "Upload canceled" ? "canceled" : "error";
        upsert(id, { state, errorMessage: message });
      });

    return task;
  },
};
