import { Briefcase, ClipboardList, House, UserRound } from '../icons';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Tab, TABS, useNav } from '../navigation';
import { space, type as typeScale, useColors } from '../theme';
import type { Icon } from './ui';

const ITEMS: Record<Tab, { label: string; icon: Icon }> = {
  home: { label: 'Home', icon: House },
  jobs: { label: 'Jobs', icon: Briefcase },
  applications: { label: 'Applications', icon: ClipboardList },
  profile: { label: 'Profile', icon: UserRound },
};

/** Bottom tab bar, above the system navigation bar. The active tab is shown by colour, weight and an indicator. */
export function TabBar() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { tab, navigate } = useNav();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingBottom: Math.max(insets.bottom, space.xs),
      }}
    >
      {TABS.map((t) => {
        const active = t === tab;
        const { label, icon: IconComponent } = ITEMS[t];
        const color = active ? c.primary : c.muted;
        return (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: active }}
            onPress={() => navigate(t)}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingTop: space.sm,
              paddingBottom: space.xs,
              minHeight: 56,
              gap: 2,
            }}
          >
            <View
              style={{
                paddingHorizontal: space.lg,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor: active ? c.primarySoft : 'transparent',
              }}
            >
              <IconComponent size={22} color={color} />
            </View>
            <RNText style={[typeScale.caption, { color, fontWeight: active ? '700' : '500' }]}>
              {label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}
