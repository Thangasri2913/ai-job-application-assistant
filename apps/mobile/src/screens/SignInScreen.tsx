import { LogIn, ShieldCheck } from '../icons';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { Banner, BrandMark, Button, Card, Text } from '../components/ui';
import { space, useColors } from '../theme';

export function SignInScreen() {
  const { signIn, notice, error, busy } = useAuth();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: c.canvas }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: space.xl,
        paddingTop: insets.top + space.xl,
        paddingBottom: insets.bottom + space.xl,
        gap: space.xl,
      }}
    >
      <BrandMark large />
      <View style={{ gap: space.sm }}>
        <Text variant="title">Find the right jobs and apply with confidence</Text>
        <Text muted>
          See real jobs matched to your resumes, prepare applications and track them — the same
          account as the JobAssist website.
        </Text>
      </View>
      {notice ? <Banner tone="warning">{notice}</Banner> : null}
      {error ? (
        <Banner tone="danger" title="Sign-in didn’t complete">
          {error}
        </Banner>
      ) : null}
      <Button
        label={busy ? 'Signing in…' : 'Sign in'}
        icon={LogIn}
        loading={busy}
        hint="Opens the JobAssist sign-in page in your browser, then returns to the app"
        onPress={() => void signIn()}
      />
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <ShieldCheck size={20} color={c.success} />
          <Text variant="small" muted style={{ flex: 1 }}>
            You sign in on the secure JobAssist page in your browser, then return here. The app
            never sees your password.
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}
