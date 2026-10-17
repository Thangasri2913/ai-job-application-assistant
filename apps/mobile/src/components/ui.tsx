import { CircleAlert, CircleCheck, Info, type LucideProps, TriangleAlert, Zap } from '../icons';
import type { ComponentType, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  type TextProps,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import {
  radius,
  space,
  type Tone,
  toneColors,
  touch,
  type as typeScale,
  useColors,
} from '../theme';

export type Icon = ComponentType<LucideProps>;

// ─── Text ───────────────────────────────────────────────────────────────────

type Variant = keyof typeof typeScale;

/** Text in the shared type scale. `tone` colours it; `muted` uses the secondary colour. */
export function Text({
  variant = 'body',
  muted,
  tone,
  style,
  ...props
}: TextProps & { variant?: Variant; muted?: boolean; tone?: Exclude<Tone, 'neutral'> }) {
  const c = useColors();
  const color = tone ? toneColors(c, tone).fg : muted ? c.muted : c.fg;
  return <RNText {...props} style={[typeScale[variant], { color }, style]} />;
}

// ─── Brand ──────────────────────────────────────────────────────────────────

/** The same mark as the web app's header. */
export function BrandMark({ large }: { large?: boolean }) {
  const c = useColors();
  const box = large ? 40 : 32;
  return (
    <View style={styles.row} accessibilityRole="header" accessibilityLabel="JobAssist">
      <View
        style={{
          width: box,
          height: box,
          borderRadius: large ? radius.md : radius.sm,
          backgroundColor: c.primary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Zap size={large ? 20 : 16} color={c.primaryFg} fill={c.primaryFg} />
      </View>
      <Text variant={large ? 'title' : 'subheading'}>JobAssist</Text>
    </View>
  );
}

// ─── Buttons ────────────────────────────────────────────────────────────────

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon: IconComponent,
  hint,
  compact,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner and blocks presses (the label stays for screen readers). */
  loading?: boolean;
  icon?: Icon;
  hint?: string;
  compact?: boolean;
  testID?: string;
}) {
  const c = useColors();
  const inactive = disabled || loading;
  const palette = {
    primary: { bg: c.primary, fg: c.primaryFg, border: c.primary },
    secondary: { bg: c.surface, fg: c.fg, border: c.border },
    ghost: { bg: 'transparent', fg: c.primary, border: 'transparent' },
    danger: { bg: c.danger, fg: c.surface, border: c.danger },
  }[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      hitSlop={compact ? 6 : 0}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : IconComponent ? (
        <IconComponent size={18} color={palette.fg} />
      ) : null}
      <RNText style={[typeScale.label, { color: palette.fg, fontWeight: '600' }]}>{label}</RNText>
    </Pressable>
  );
}

// ─── Surfaces ───────────────────────────────────────────────────────────────

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: ReactNode;
  style?: ViewStyle;
  /** Makes the whole card one tappable target (e.g. to open details). */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const c = useColors();
  const base = [styles.card, { backgroundColor: c.surface, borderColor: c.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { backgroundColor: c.surfaceMuted }]}
    >
      {children}
    </Pressable>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text variant="subheading" accessibilityRole="header">
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

// ─── Status ─────────────────────────────────────────────────────────────────

/** A status label: soft background + text (never colour alone). */
export function Badge({
  label,
  tone = 'neutral',
  icon: IconComponent,
}: {
  label: string;
  tone?: Tone;
  icon?: Icon;
}) {
  const c = useColors();
  const t = toneColors(c, tone);
  return (
    <View accessibilityLabel={label} style={[styles.badge, { backgroundColor: t.bg }]}>
      {IconComponent ? <IconComponent size={13} color={t.fg} /> : null}
      <RNText style={[typeScale.caption, { color: t.fg }]}>{label}</RNText>
    </View>
  );
}

const BANNER_ICON: Record<Tone, Icon> = {
  neutral: Info,
  primary: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
};

/** An inline message. Errors and warnings are announced to screen readers. */
export function Banner({
  tone = 'primary',
  title,
  children,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const c = useColors();
  const t = toneColors(c, tone);
  const IconComponent = BANNER_ICON[tone];
  const urgent = tone === 'danger' || tone === 'warning';
  return (
    <View
      accessibilityRole={urgent ? 'alert' : 'summary'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}
      style={[styles.banner, { backgroundColor: t.bg }]}
    >
      <IconComponent size={18} color={t.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: space.xs }}>
        {title ? (
          <RNText style={[typeScale.label, { color: t.fg, fontWeight: '600' }]}>{title}</RNText>
        ) : null}
        {typeof children === 'string' ? (
          <RNText style={[typeScale.small, { color: c.fg }]}>{children}</RNText>
        ) : (
          children
        )}
        {action}
      </View>
    </View>
  );
}

/** The AI-assisted compatibility score (never a hiring probability). */
export function MatchScore({ score, compact }: { score: number; compact?: boolean }) {
  const tone: Tone = score >= 70 ? 'success' : score >= 50 ? 'warning' : 'neutral';
  const level = score >= 70 ? 'Strong match' : score >= 50 ? 'Moderate match' : 'Low match';
  return <Badge tone={tone} label={compact ? `${score}%` : `${score}% · ${level}`} />;
}

/** Steps of a process with the current one highlighted (text says the state, too). */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}: ${steps[Math.min(current, steps.length - 1)]}`}
      style={{ gap: space.sm }}
    >
      <View style={[styles.row, { gap: space.xs }]}>
        {steps.map((s, i) => (
          <View
            key={s}
            style={{
              flex: 1,
              height: 6,
              borderRadius: radius.pill,
              backgroundColor: i < current ? c.primary : i === current ? c.primary : c.border,
              opacity: i === current ? 0.55 : 1,
            }}
          />
        ))}
      </View>
      <Text variant="caption" muted>
        Step {Math.min(current + 1, steps.length)} of {steps.length} ·{' '}
        {steps[Math.min(current, steps.length - 1)]}
      </Text>
    </View>
  );
}

// ─── States ─────────────────────────────────────────────────────────────────

export function LoadingState({ label }: { label: string }) {
  const c = useColors();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={styles.center}>
      <ActivityIndicator color={c.primary} size="large" />
      <Text muted>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon: IconComponent,
  title,
  text,
  action,
}: {
  icon: Icon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.center}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
        <IconComponent size={24} color={c.primary} />
      </View>
      <Text variant="subheading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      <Text muted style={{ textAlign: 'center' }}>
        {text}
      </Text>
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={{ gap: space.md, paddingVertical: space.lg }}>
      <Banner tone="danger" title="Couldn’t load this">
        {message}
      </Banner>
      {onRetry ? <Button label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

// ─── Form controls ──────────────────────────────────────────────────────────

export function TextField({
  label,
  required,
  hint,
  error,
  multiline,
  style,
  ...props
}: TextInputProps & { label: string; required?: boolean; hint?: string; error?: string | null }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="label">
        {label}
        <Text variant="small" muted>
          {required ? '  Required' : '  Optional'}
        </Text>
      </Text>
      {hint ? (
        <Text variant="small" muted>
          {hint}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={c.muted}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...props}
        style={[
          styles.input,
          multiline && { minHeight: 96, paddingTop: space.md },
          { borderColor: error ? c.danger : c.border, color: c.fg, backgroundColor: c.surface },
          style,
        ]}
      />
      {error ? (
        <Text
          variant="small"
          tone="danger"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A labelled checkbox with a 48 dp touch target. */
export function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={[
        styles.row,
        { minHeight: touch, alignItems: 'flex-start', paddingVertical: space.sm },
      ]}
    >
      <View
        style={[
          styles.checkbox,
          {
            borderColor: checked ? c.primary : c.muted,
            backgroundColor: checked ? c.primary : c.surface,
          },
        ]}
      >
        {checked ? <CircleCheck size={16} color={c.primaryFg} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text>{label}</Text>
        {description ? (
          <Text variant="small" muted>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Single choice from a short list (radio buttons). */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; description?: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: space.sm }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.label}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.value)}
            style={[
              styles.choice,
              {
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primarySoft : c.surface,
              },
            ]}
          >
            <View style={[styles.radio, { borderColor: selected ? c.primary : c.muted }]}>
              {selected ? <View style={[styles.radioDot, { backgroundColor: c.primary }]} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="label">{o.label}</Text>
              {o.description ? (
                <Text variant="small" muted>
                  {o.description}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small horizontal filter chips. */
export function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[styles.row, { flexWrap: 'wrap', gap: space.sm }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(o.value)}
            hitSlop={6}
            style={[
              styles.chip,
              {
                borderColor: selected ? c.primary : c.border,
                backgroundColor: selected ? c.primarySoft : c.surface,
              },
            ]}
          >
            <RNText
              style={[
                typeScale.small,
                { color: selected ? c.primary : c.fg, fontWeight: selected ? '600' : '400' },
              ]}
            >
              {o.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A tappable row (settings lists, navigation). */
export function ListRow({
  icon: IconComponent,
  title,
  subtitle,
  onPress,
  trailing,
}: {
  icon?: Icon;
  title: string;
  subtitle?: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: c.surfaceMuted }]}
    >
      {IconComponent ? <IconComponent size={20} color={c.muted} /> : null}
      <View style={{ flex: 1 }}>
        <Text variant="label">{title}</Text>
        {subtitle ? (
          <Text variant="small" muted>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  button: {
    minHeight: touch,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonCompact: { minHeight: 40, paddingHorizontal: space.md },
  card: { borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
  },
  banner: { flexDirection: 'row', gap: space.md, borderRadius: radius.md, padding: space.md },
  center: { alignItems: 'center', justifyContent: 'center', padding: space.xxl, gap: space.md },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: touch,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  choice: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
  },
  listRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
});
