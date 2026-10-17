import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ConfirmProvider } from './components/ConfirmDialog';
import { TabBar } from './components/TabBar';
import { BrandMark, LoadingState } from './components/ui';
import { NavigationProvider, type Route, useNav } from './navigation';
import { ApplicationScreen } from './screens/ApplicationScreen';
import { ApplicationsScreen } from './screens/ApplicationsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { JobScreen } from './screens/JobScreen';
import { JobsScreen } from './screens/JobsScreen';
import { MaterialsScreen } from './screens/MaterialsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { QuestionsScreen } from './screens/QuestionsScreen';
import { ResumesScreen } from './screens/ResumesScreen';
import { SavedAnswersScreen } from './screens/SavedAnswersScreen';
import { SignInScreen } from './screens/SignInScreen';
import { SmartApplySettingsScreen } from './screens/SmartApplySettingsScreen';
import { TrackedApplicationScreen } from './screens/TrackedApplicationScreen';
import { space, useColors } from './theme';

export function App() {
  return (
    <SafeAreaProvider>
      <ConfirmProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <Root />
        </AuthProvider>
      </ConfirmProvider>
    </SafeAreaProvider>
  );
}

export function Root() {
  const { status } = useAuth();
  const c = useColors();
  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.canvas,
          justifyContent: 'center',
          alignItems: 'center',
          gap: space.lg,
        }}
      >
        <BrandMark large />
        <LoadingState label="Restoring your session" />
      </View>
    );
  }
  if (status === 'signedOut') return <SignInScreen />;
  return (
    <NavigationProvider>
      <View style={{ flex: 1, backgroundColor: c.canvas }}>
        <CurrentScreen />
        <TabBar />
      </View>
    </NavigationProvider>
  );
}

export function screenFor(route: Route) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'questions':
      return <QuestionsScreen />;
    case 'jobs':
      return <JobsScreen />;
    case 'job':
      return <JobScreen jobId={route.jobId} recommendationId={route.recommendationId} />;
    case 'applications':
      return <ApplicationsScreen />;
    case 'application':
      return <ApplicationScreen id={route.id} />;
    case 'trackedApplication':
      return <TrackedApplicationScreen id={route.id} />;
    case 'materials':
      return <MaterialsScreen id={route.id} />;
    case 'profile':
      return <ProfileScreen />;
    case 'resumes':
      return <ResumesScreen />;
    case 'smartApplySettings':
      return <SmartApplySettingsScreen />;
    case 'savedAnswers':
      return <SavedAnswersScreen />;
  }
}

function CurrentScreen() {
  const { tab, route, depth } = useNav();
  // Keyed by position so returning to a screen re-renders it fresh and reloads its data.
  return (
    <View style={{ flex: 1 }} key={`${tab}-${depth}-${route.name}`}>
      {screenFor(route)}
    </View>
  );
}
