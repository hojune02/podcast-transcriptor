import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { getUserTranscripts, getUserJobs, formatDuration } from '@/lib/api';
import type { Transcript, TranscriptionJob } from '@/lib/types';

export default function LibraryScreen() {
  const {
    data: transcripts,
    isLoading: isLoadingTranscripts,
    refetch: refetchTranscripts,
  } = useQuery({
    queryKey: ['transcripts'],
    queryFn: getUserTranscripts,
    refetchInterval: 5000,
  });

  const {
    data: activeJobs,
    isLoading: isLoadingJobs,
  } = useQuery({
    queryKey: ['jobs'],
    queryFn: getUserJobs,
    refetchInterval: 5000, // poll for job updates
  });

  const isLoading = isLoadingTranscripts || isLoadingJobs;

  return (
    <SafeAreaView className="flex-1 bg-gray-950">
      <View className="flex-1 px-4 pt-4">
        <Text className="text-white text-2xl font-bold mb-4">Library</Text>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#6366F1" size="large" />
          </View>
        ) : (
          <FlatList
            data={[
              ...((activeJobs ?? []).map((j) => ({ type: 'job' as const, data: j }))),
              ...((transcripts ?? []).map((t) => ({ type: 'transcript' as const, data: t }))),
            ]}
            keyExtractor={(item) => `${item.type}-${item.data.id}`}
            renderItem={({ item }) =>
              item.type === 'job' ? (
                <ActiveJobCard job={item.data} />
              ) : (
                <TranscriptCard transcript={item.data} />
              )
            }
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-20">
                <Text className="text-5xl mb-4">📚</Text>
                <Text className="text-white text-lg font-semibold">No transcripts yet</Text>
                <Text className="text-gray-400 text-sm text-center mt-2">
                  Search for a podcast and transcribe an episode to get started.
                </Text>
              </View>
            }
            onRefresh={refetchTranscripts}
            refreshing={isLoadingTranscripts}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function ActiveJobCard({ job }: { job: TranscriptionJob }) {
  const episodeTitle = (job.episode as any)?.title ?? 'Processing…';
  const podcastTitle = (job.episode as any)?.podcast?.title;
  const imageUrl = (job.episode as any)?.podcast?.image_url;
  const statusLabel = job.status === 'queued' ? 'Queued' : `Transcribing ${job.progress}%`;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/transcript/${job.id}?isJob=true`)}
      className="flex-row bg-gray-800 rounded-xl p-3 mb-3 items-center gap-3"
      activeOpacity={0.7}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} className="w-14 h-14 rounded-lg bg-gray-700" />
      ) : (
        <View className="w-14 h-14 rounded-lg bg-gray-700 items-center justify-center">
          <Text className="text-xl">🎙️</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-white text-sm font-medium" numberOfLines={1}>{episodeTitle}</Text>
        {podcastTitle && (
          <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>{podcastTitle}</Text>
        )}
        <View className="mt-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-indigo-400 text-xs">{statusLabel}</Text>
          </View>
          <View className="h-1 bg-gray-700 rounded-full overflow-hidden">
            <View className="h-full bg-indigo-500 rounded-full" style={{ width: `${job.progress}%` }} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TranscriptCard({ transcript }: { transcript: Transcript }) {
  const episodeTitle = transcript.episode?.title ?? 'Unknown Episode';
  const podcastTitle = (transcript.episode as any)?.podcast?.title;
  const imageUrl = (transcript.episode as any)?.podcast?.image_url;
  const duration = formatDuration(transcript.duration_seconds);
  const date = new Date(transcript.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <TouchableOpacity
      onPress={() => router.push(`/transcript/${transcript.id}`)}
      className="flex-row bg-gray-800 rounded-xl p-3 mb-3 items-center gap-3"
      activeOpacity={0.7}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} className="w-14 h-14 rounded-lg bg-gray-700" />
      ) : (
        <View className="w-14 h-14 rounded-lg bg-gray-700 items-center justify-center">
          <Text className="text-xl">🎙️</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-white text-sm font-medium" numberOfLines={2}>{episodeTitle}</Text>
        {podcastTitle && (
          <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>{podcastTitle}</Text>
        )}
        <View className="flex-row gap-3 mt-1">
          <Text className="text-gray-500 text-xs">{date}</Text>
          <Text className="text-gray-500 text-xs">{duration}</Text>
          {transcript.word_count && (
            <Text className="text-gray-500 text-xs">{transcript.word_count.toLocaleString()} words</Text>
          )}
        </View>
      </View>
      <Text className="text-gray-500 text-lg">›</Text>
    </TouchableOpacity>
  );
}
