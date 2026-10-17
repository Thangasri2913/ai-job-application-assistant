import { MessageSquareText, Trash2 } from '../icons';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
} from '../components/ui';
import { formatDate } from '../format';
import { space } from '../theme';
import { messageOf, useLoad } from '../useLoad';

/** Answers you confirmed and chose to reuse. Sensitive ones are always confirmed again. */
export function SavedAnswersScreen() {
  const { api } = useAuth();
  const confirm = useConfirm();
  const list = useLoad(() => api.savedAnswers(), [api]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const remove = async (id: string, label: string) => {
    const ok = await confirm({
      title: 'Delete this saved answer?',
      message: `“${label}” won’t be offered in future applications. Applications already prepared keep their answers.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setDeleting(id);
    setError(null);
    try {
      await api.deleteSavedAnswer(id);
      list.reload();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Screen title="Saved answers" refreshing={list.refreshing} onRefresh={list.reload}>
      <Text muted>
        Demographic answers are never saved. Sensitive answers are pre-filled but always need your
        confirmation.
      </Text>
      {error ? <Banner tone="danger">{error}</Banner> : null}
      {list.loading ? (
        <LoadingState label="Loading saved answers" />
      ) : !list.data ? (
        <ErrorState message={list.error ?? 'Please try again.'} onRetry={list.reload} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="No saved answers"
          text="When you answer a question, you can choose to save the answer for later applications."
        />
      ) : (
        list.data.map((a) => (
          <Card key={a.id}>
            <Text variant="label">{a.label}</Text>
            <Text muted>{a.answer}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
              {a.sensitivity === 'SENSITIVE' ? (
                <Badge label="Confirmed each time" tone="warning" />
              ) : (
                <Badge label="Reused" />
              )}
            </View>
            {a.validUntil ? (
              <Text variant="caption" muted>
                Reused until {formatDate(a.validUntil)}
              </Text>
            ) : null}
            <Button
              compact
              label="Delete"
              icon={Trash2}
              variant="ghost"
              loading={deleting === a.id}
              onPress={() => void remove(a.id, a.label)}
            />
          </Card>
        ))
      )}
    </Screen>
  );
}
