export type UploadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number; // 0..1
  speedBps: number; // smoothed bytes/sec
  etaSeconds: number | null;
};

export type PutWithProgressParams = {
  url: string;
  body: Blob;
  contentType: string;
  onProgress: (p: UploadProgress) => void;
  onState?: (state: "starting" | "uploading" | "done") => void;
};

export function putWithProgress(params: PutWithProgressParams): {
  promise: Promise<void>;
  abort: () => void;
} {
  const totalBytes = Math.max(0, params.body.size || 0);

  let lastAt = performance.now();
  let lastLoaded = 0;
  let speedBps = 0;

  const xhr = new XMLHttpRequest();

  const update = (loaded: number) => {
    const now = performance.now();
    const dt = Math.max(1, now - lastAt);
    const dBytes = Math.max(0, loaded - lastLoaded);
    const inst = (dBytes * 1000) / dt;

    // EWMA smoothing.
    speedBps = speedBps <= 0 ? inst : speedBps * 0.9 + inst * 0.1;

    lastAt = now;
    lastLoaded = loaded;

    const safeTotal = totalBytes > 0 ? totalBytes : loaded;
    const percent = safeTotal > 0 ? Math.min(1, loaded / safeTotal) : 0;
    const remaining = Math.max(0, safeTotal - loaded);
    const etaSeconds = speedBps > 1 ? remaining / speedBps : null;

    params.onProgress({
      loadedBytes: loaded,
      totalBytes: safeTotal,
      percent,
      speedBps,
      etaSeconds,
    });
  };

  const promise = new Promise<void>((resolve, reject) => {
    xhr.upload.onprogress = (e) => {
      params.onState?.("uploading");
      // Some browsers may not report e.total for PUT; rely on blob size.
      const loaded = typeof e.loaded === "number" ? e.loaded : lastLoaded;
      update(loaded);
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload canceled"));

    xhr.onload = () => {
      // S3 presigned PUT returns 200/204.
      if (xhr.status >= 200 && xhr.status < 300) {
        update(totalBytes);
        params.onState?.("done");
        resolve();
        return;
      }
      reject(new Error(`Upload failed (${xhr.status})`));
    };

    params.onState?.("starting");
    xhr.open("PUT", params.url, true);
    xhr.setRequestHeader("Content-Type", params.contentType);
    xhr.send(params.body);
  });

  return {
    promise,
    abort: () => xhr.abort(),
  };
}
