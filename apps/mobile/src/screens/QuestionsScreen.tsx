import { CircleCheck } from '../icons';
import { useAuth } from '../auth/AuthContext';
import { QuestionForm } from '../components/QuestionForm';
import { Screen } from '../components/Screen';
import { Banner, EmptyState, ErrorState, LoadingState, Text } from '../components/ui';
import { useLoad } from '../useLoad';

/** Every required answer still needed, across your applications. */
export function QuestionsScreen() {
  const { api } = useAuth();
  const inbox = useLoad(() => api.questions(), [api]);
  return (
    <Screen title="Questions to answer" refreshing={inbox.refreshing} onRefresh={inbox.reload}>
      <Text muted>
        Applications wait until you answer. The app never guesses — especially for legal or salary
        questions.
      </Text>
      {inbox.loading ? (
        <LoadingState label="Loading questions" />
      ) : !inbox.data ? (
        <ErrorState message={inbox.error ?? 'Please try again.'} onRetry={inbox.reload} />
      ) : inbox.data.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="No questions waiting"
          text="All required answers are given."
        />
      ) : (
        <>
          {inbox.error ? <Banner tone="warning">{inbox.error}</Banner> : null}
          {inbox.data.map((q) => (
            <QuestionForm key={q.id} question={q} onSaved={inbox.reload} showJob />
          ))}
        </>
      )}
    </Screen>
  );
}
