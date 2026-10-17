import { useColorScheme } from 'react-native';

/**
 * Design tokens, mirroring the web app's theme (apps/web/src/index.css) so both apps look like
 * the same product: same palette, semantic colours, radii and type scale, in light and dark.
 */
const light = {
  canvas: '#f6f7f9',
  surface: '#ffffff',
  surfaceMuted: '#f1f3f6',
  border: '#e3e6eb',
  fg: '#111827',
  muted: '#5b6474',
  primary: '#4f46e5',
  primaryFg: '#ffffff',
  primarySoft: '#eef0ff',
  danger: '#b42318',
  dangerSoft: '#fef0ef',
  success: '#067647',
  successSoft: '#ecfdf3',
  warning: '#b54708',
  warningSoft: '#fffaeb',
  overlay: 'rgba(17, 24, 39, 0.45)',
};

const dark: typeof light = {
  canvas: '#0d1017',
  surface: '#151922',
  surfaceMuted: '#1c212c',
  border: '#2a303c',
  fg: '#e8eaee',
  muted: '#9aa3b2',
  primary: '#8b85ff',
  primaryFg: '#0d1017',
  primarySoft: '#23244a',
  danger: '#ff8a80',
  dangerSoft: '#3a1d1c',
  success: '#6ce9a6',
  successSoft: '#13301f',
  warning: '#fdb022',
  warningSoft: '#352713',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = typeof light;
export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

/** Spacing scale (dp), the same 4-based steps the web uses. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
/** Corner radii: web rounded-lg / rounded-xl / rounded-2xl. */
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/** Minimum size of interactive elements (Android guidance: 48 dp). */
export const touch = 48;

export const type = {
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600' },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  small: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Foreground and soft background for a semantic tone. */
export function toneColors(c: Colors, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'primary':
      return { fg: c.primary, bg: c.primarySoft };
    case 'success':
      return { fg: c.success, bg: c.successSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'danger':
      return { fg: c.danger, bg: c.dangerSoft };
    default:
      return { fg: c.muted, bg: c.surfaceMuted };
  }
}
