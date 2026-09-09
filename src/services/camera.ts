import type { Photo } from "../types/observation";

export async function preparePhoto(
  file: File,
  observationId: string,
): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Choose a JPEG, PNG, or WebP photo. Convert HEIC photos to JPEG first.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose a photo smaller than 20 MB.");
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image processing is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    // Re-encoding pixels strips the original EXIF, including embedded GPS metadata.
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Could not compress this photo.")),
        "image/jpeg",
        0.8,
      ),
    );
    return {
      id: crypto.randomUUID(),
      observationId,
      blob,
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    image.close();
  }
}
