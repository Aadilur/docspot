import { useSyncExternalStore } from "react";
import { uploadStore, type UploadTask } from "./store";

export function useUploads(): UploadTask[] {
  return useSyncExternalStore(
    uploadStore.subscribe,
    uploadStore.getSnapshot,
    uploadStore.getSnapshot,
  );
}
