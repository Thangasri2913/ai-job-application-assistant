/** Accepts only in-app paths, so `?returnUrl=` cannot redirect to another site. */
export function safeReturnUrl(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
    return fallback;
  if (value.startsWith('/login') || value.startsWith('/register')) return fallback;
  return value;
}
