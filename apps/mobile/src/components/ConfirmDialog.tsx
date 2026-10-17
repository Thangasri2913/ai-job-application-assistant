import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Pressable, View } from 'react-native';
import { radius, space, useColors } from '../theme';
import { Button, Text } from './ui';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Destructive actions get a red confirm button. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Confirm | null>(null);

/**
 * One in-app confirmation dialog for consequential actions (cancel an application, delete a
 * saved answer, sign out, report a submission…). Styled like the rest of the app, unlike the
 * system Alert, and testable.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>(
    (o) =>
      new Promise<boolean>((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setOptions(o);
      }),
    [],
  );
  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };
  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        transparent
        visible={options !== null}
        animationType="fade"
        onRequestClose={() => close(false)}
        statusBarTranslucent
      >
        <Pressable
          accessibilityLabel="Close dialog"
          onPress={() => close(false)}
          style={{
            flex: 1,
            backgroundColor: c.overlay,
            justifyContent: 'center',
            padding: space.xxl,
          }}
        >
          {options ? (
            <Pressable
              accessibilityViewIsModal
              accessibilityRole="none"
              onPress={() => undefined}
              style={{
                backgroundColor: c.surface,
                borderRadius: radius.lg,
                padding: space.xl,
                gap: space.md,
              }}
            >
              <Text variant="heading" accessibilityRole="header">
                {options.title}
              </Text>
              <Text muted>{options.message}</Text>
              <View style={{ gap: space.sm, marginTop: space.sm }}>
                <Button
                  label={options.confirmLabel}
                  variant={options.destructive ? 'danger' : 'primary'}
                  onPress={() => close(true)}
                />
                <Button
                  label={options.cancelLabel ?? 'Cancel'}
                  variant="secondary"
                  onPress={() => close(false)}
                />
              </View>
            </Pressable>
          ) : null}
        </Pressable>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}
