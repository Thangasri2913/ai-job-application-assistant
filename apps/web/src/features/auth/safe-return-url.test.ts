import { safeReturnUrl } from './safe-return-url';

describe('safeReturnUrl', () => {
  it('accepts in-app paths', () => {
    expect(safeReturnUrl('/jobs?tab=open')).toBe('/jobs?tab=open');
  });

  it.each([
    ['missing', undefined],
    ['absolute URL', 'https://evil.example'],
    ['protocol-relative URL', '//evil.example'],
    ['backslash trick', '/\\evil.example'],
    ['auth page loop', '/login?returnUrl=/x'],
  ])('falls back for %s', (_label, value) => {
    expect(safeReturnUrl(value)).toBe('/dashboard');
  });
});
