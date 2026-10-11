/** RFC 6266 `attachment` header for a (sanitised) filename: ASCII fallback + UTF-8. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** Headers for streaming a user's stored file back to them. */
export function downloadHeaders(filename: string, mimeType: string): Record<string, string> {
  return {
    'Content-Type': mimeType,
    'Content-Disposition': contentDisposition(filename),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  };
}
