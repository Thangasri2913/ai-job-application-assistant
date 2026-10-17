import { ChevronLeft } from '../icons';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNav } from '../navigation';
import { space, touch, useColors } from '../theme';
import { Text } from './ui';

/** Screen header: back button on pushed screens, then the title. Sits below the status bar. */
export function Header({ title, right }: { title: string; right?: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { depth, back } = useNav();
  return (
    <View
      style={{
        paddingTop: insets.top + space.sm,
        paddingBottom: space.sm,
        paddingHorizontal: space.sm,
        backgroundColor: c.surface,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        minHeight: insets.top + 56,
      }}
    >
      {depth > 1 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => void back()}
          style={{ width: touch, height: touch, alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronLeft size={24} color={c.fg} />
        </Pressable>
      ) : (
        <View style={{ width: space.sm }} />
      )}
      <Text variant="heading" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/**
 * A scrolling screen with header, pull-to-refresh and keyboard handling: focused inputs stay
 * visible above the keyboard and taps on buttons work while it is open.
 */
export function Screen({
  title,
  children,
  refreshing,
  onRefresh,
  headerRight,
}: {
  title: string;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  headerRight?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Header title={title} right={headerRight} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxxl }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={Boolean(refreshing)}
                onRefresh={onRefresh}
                colors={[c.primary]}
                tintColor={c.primary}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
