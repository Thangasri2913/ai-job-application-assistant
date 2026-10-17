import { type JobRecommendationItem, WORK_MODE_LABELS, type WorkMode } from '@job-assist/shared';
import { Search, Sparkles } from '../icons';
import { useEffect, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import type { RecommendationQuery } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Header } from '../components/Screen';
import {
  Badge,
  Banner,
  Button,
  Card,
  Chips,
  EmptyState,
  ErrorState,
  LoadingState,
  MatchScore,
  Text,
} from '../components/ui';
import { relativeDay } from '../format';
import { useNav } from '../navigation';
import { radius, space, touch, useColors } from '../theme';
import { useLoad } from '../useLoad';

type StatusFilter = 'ACTIVE' | 'NEW' | 'SAVED';
type ScoreFilter = '0' | '70' | '80';
type ModeFilter = 'ANY' | WorkMode;

/**
 * Recommended jobs (the same list as the web app's Recommendations), virtualised, with the
 * filters the API supports: status, minimum score, work mode and a title search.
 */
export function JobsScreen() {
  const { api } = useAuth();
  const { push } = useNav();
  const c = useColors();
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [score, setScore] = useState<ScoreFilter>('0');
  const [mode, setMode] = useState<ModeFilter>('ANY');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  // Search after typing pauses, not on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setTitle(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  const query: RecommendationQuery = {
    status,
    ...(score !== '0' ? { minScore: Number(score) } : {}),
    ...(mode !== 'ANY' ? { workMode: mode } : {}),
    ...(title ? { title } : {}),
  };
  const list = useLoad(() => api.recommendations(query), [api, status, score, mode, title]);
  const filtered = status !== 'ACTIVE' || score !== '0' || mode !== 'ANY' || title !== '';

  const filters = (
    <View style={{ gap: space.md, paddingBottom: space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.sm,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: radius.sm,
          backgroundColor: c.surface,
          paddingHorizontal: space.md,
          minHeight: touch,
        }}
      >
        <Search size={18} color={c.muted} />
        <TextInput
          accessibilityLabel="Search job titles"
          placeholder="Search job titles"
          placeholderTextColor={c.muted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: c.fg, fontSize: 15, minHeight: touch }}
        />
      </View>
      <Chips<StatusFilter>
        label="Show"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'ACTIVE', label: 'All' },
          { value: 'NEW', label: 'New' },
          { value: 'SAVED', label: 'Saved' },
        ]}
      />
      <Chips<ScoreFilter>
        label="Minimum match"
        value={score}
        onChange={setScore}
        options={[
          { value: '0', label: 'Any match' },
          { value: '70', label: '70%+' },
          { value: '80', label: '80%+' },
        ]}
      />
      <Chips<ModeFilter>
        label="Work mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'ANY', label: 'Any work mode' },
          { value: 'REMOTE', label: WORK_MODE_LABELS.REMOTE },
          { value: 'HYBRID', label: WORK_MODE_LABELS.HYBRID },
          { value: 'ONSITE', label: WORK_MODE_LABELS.ONSITE },
        ]}
      />
      {list.data && list.error ? <Banner tone="warning">{list.error}</Banner> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <Header title="Jobs" />
      <FlatList
        data={list.data ?? []}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxxl }}
        ListHeaderComponent={filters}
        refreshControl={
          <RefreshControl
            refreshing={list.refreshing}
            onRefresh={list.reload}
            colors={[c.primary]}
            tintColor={c.primary}
          />
        }
        ListEmptyComponent={
          list.loading ? (
            <LoadingState label="Loading jobs" />
          ) : list.error ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : (
            <EmptyState
              icon={Sparkles}
              title={filtered ? 'No jobs match these filters' : 'No job matches yet'}
              text={
                filtered
                  ? 'Try removing a filter or a search word.'
                  : 'Your job alerts add real jobs here when they match your resumes. Set up alerts on the JobAssist website.'
              }
              action={
                filtered ? (
                  <Button
                    variant="secondary"
                    label="Clear filters"
                    onPress={() => {
                      setStatus('ACTIVE');
                      setScore('0');
                      setMode('ANY');
                      setSearch('');
                    }}
                  />
                ) : undefined
              }
            />
          )
        }
        renderItem={({ item }) => (
          <JobCard
            item={item}
            onOpen={() => push({ name: 'job', jobId: item.job.id, recommendationId: item.id })}
          />
        )}
      />
    </View>
  );
}

export function JobCard({ item: r, onOpen }: { item: JobRecommendationItem; onOpen: () => void }) {
  const facts = [
    r.job.companyName,
    r.job.location,
    r.job.workMode ? WORK_MODE_LABELS[r.job.workMode] : null,
  ].filter(Boolean);
  return (
    <Card
      onPress={onOpen}
      accessibilityLabel={`${r.job.title}, ${facts.join(', ')}. ${r.matchScore}% match.`}
      accessibilityHint="Opens the job details"
    >
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
        <Text variant="subheading" numberOfLines={2} style={{ flex: 1 }}>
          {r.job.title}
        </Text>
        <MatchScore score={r.matchScore} compact />
      </View>
      <Text variant="small" muted numberOfLines={2}>
        {facts.join(' · ')}
      </Text>
      <Text variant="small" numberOfLines={2}>
        {r.reason}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
        {r.status === 'NEW' ? <Badge label="New" tone="primary" /> : null}
        {r.status === 'SAVED' ? <Badge label="Saved" /> : null}
        {r.status === 'APPLIED' ? <Badge label="Applied" tone="success" /> : null}
        {r.job.isSampleData ? <Badge label="Sample data" tone="warning" /> : null}
      </View>
      <Text variant="caption" muted>
        {[
          r.job.postedAt ? `Posted ${relativeDay(r.job.postedAt).toLowerCase()}` : null,
          r.source ? `via ${r.source.name}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  );
}
