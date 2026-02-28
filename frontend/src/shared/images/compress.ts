const DEFAULT_QUALITY = 0.82;

function extForMime(type: string): string {
  const t = type.toLowerCase().split(";")[0];
  if (t === "image/jpeg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/gif") return "gif";
  if (t === "image/avif") return "avif";
  if (t === "image/svg+xml") return "svg";
  return "img";
}

function replaceFilenameExt(filename: string, newExt: string): string {
  const safe = (filename || "upload").trim() || "upload";
  const lastDot = safe.lastIndexOf(".");
  const base = lastDot > 0 ? safe.slice(0, lastDot) : safe;
  return `${base}.${newExt}`;
}

function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number | undefined,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) {
          reject(new Error("Failed to encode image"));
          return;
        }
        resolve(b);
      },
      type,
      quality,
    );
  });
}

export type CompressImageOptions = {
  maxWidth: number;
  maxHeight: number;
  // Output MIME type; if omitted we keep png/webp, otherwise default to jpeg.
  outputType?: "image/jpeg" | "image/png" | "image/webp";
  // 0..1 for lossy formats.
  quality?: number;
  // If the input is already <= this, we keep it (unless resizing is needed).
  keepIfSmallerThanBytes?: number;
};

export async function compressImageFile(
  file: File,
  options: CompressImageOptions,
): Promise<{ file: File; contentType: string; filename: string }> {
  if (!file.type.startsWith("image/")) {
    return {
      file,
      contentType: file.type || "application/octet-stream",
      filename: file.name || "upload",
    };
  }

  // Don't attempt to rasterize SVGs.
  if (file.type === "image/svg+xml") {
    return { file, contentType: file.type, filename: file.name || "image.svg" };
  }

  const img = await loadImageFromFile(file);
  const srcW = Math.max(1, img.naturalWidth || img.width || 1);
  const srcH = Math.max(1, img.naturalHeight || img.height || 1);

  const scale = Math.min(1, options.maxWidth / srcW, options.maxHeight / srcH);

  const needsResize = scale < 1;
  const keepIfSmall =
    typeof options.keepIfSmallerThanBytes === "number" &&
    Number.isFinite(options.keepIfSmallerThanBytes) &&
    options.keepIfSmallerThanBytes > 0 &&
    file.size <= options.keepIfSmallerThanBytes;

  if (!needsResize && keepIfSmall) {
    return { file, contentType: file.type, filename: file.name || "upload" };
  }

  const targetW = Math.max(1, Math.round(srcW * scale));
  const targetH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported");
  ctx.drawImage(img, 0, 0, targetW, targetH);

  const outputType =
    options.outputType ??
    (file.type === "image/png" || file.type === "image/webp"
      ? (file.type as "image/png" | "image/webp")
      : "image/jpeg");

  const quality =
    outputType === "image/png"
      ? undefined
      : (options.quality ?? DEFAULT_QUALITY);

  const blob = await canvasToBlob(canvas, outputType, quality);

  const nextName = replaceFilenameExt(
    file.name || "upload",
    extForMime(outputType),
  );

  const out = new File([blob], nextName, {
    type: outputType,
    lastModified: Date.now(),
  });

  return { file: out, contentType: out.type, filename: out.name };
}
