/** Accept only bounded raster data URLs supplied with managed attachments. */
export function imagePreviewUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2_000_000) return;
  return /^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value) ? value : undefined;
}
