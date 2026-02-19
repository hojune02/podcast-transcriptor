import { View, Text, TouchableOpacity } from 'react-native';
import { formatDuration } from '@/lib/api';
import type { Episode } from '@/lib/types';

interface EpisodeCardProps {
  episode: Episode;
  onTranscribe: () => void;
  hasTranscript?: boolean;
  isTranscribing?: boolean;
  progress?: number;
}

export function EpisodeCard({ episode, onTranscribe, hasTranscript, isTranscribing, progress }: EpisodeCardProps) {
  const publishedDate = episode.published_at
    ? new Date(episode.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <View className="bg-gray-800 rounded-xl p-4 mb-3">
      <Text className="text-white font-medium text-sm" numberOfLines={2}>{episode.title}</Text>

      <View className="flex-row items-center gap-3 mt-2">
        {publishedDate && (
          <Text className="text-gray-500 text-xs">{publishedDate}</Text>
        )}
        {episode.duration_seconds && (
          <Text className="text-gray-500 text-xs">{formatDuration(episode.duration_seconds)}</Text>
        )}
      </View>

      {episode.description ? (
        <Text className="text-gray-400 text-xs mt-2" numberOfLines={3}>{episode.description}</Text>
      ) : null}

      <View className="mt-3">
        {isTranscribing ? (
          <View>
            <View className="flex-row justify-between mb-1">
              <Text className="text-indigo-400 text-xs">Transcribing…</Text>
              <Text className="text-indigo-400 text-xs">{progress ?? 0}%</Text>
            </View>
            <View className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <View
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${progress ?? 0}%` }}
              />
            </View>
          </View>
        ) : hasTranscript ? (
          <TouchableOpacity
            onPress={onTranscribe}
            className="bg-gray-700 rounded-lg py-2 px-4 self-start"
          >
            <Text className="text-indigo-400 text-xs font-semibold">View Transcript</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onTranscribe}
            className="bg-indigo-500 rounded-lg py-2 px-4 self-start"
          >
            <Text className="text-white text-xs font-semibold">Transcribe</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
