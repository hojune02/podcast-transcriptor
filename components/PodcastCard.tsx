import { View, Text, Image, TouchableOpacity } from 'react-native';
import type { Podcast, PodcastIndexResult } from '@/lib/types';

interface PodcastCardProps {
  podcast: PodcastIndexResult | Podcast;
  onPress: () => void;
}

function isPodcastIndexResult(p: PodcastIndexResult | Podcast): p is PodcastIndexResult {
  return 'url' in p;
}

export function PodcastCard({ podcast, onPress }: PodcastCardProps) {
  const title = podcast.title;
  const author = isPodcastIndexResult(podcast) ? podcast.author : (podcast.author ?? '');
  const imageUrl = isPodcastIndexResult(podcast) ? podcast.image : (podcast.image_url ?? '');
  const description = isPodcastIndexResult(podcast)
    ? podcast.description
    : (podcast.description ?? '');

  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row bg-gray-800 rounded-xl p-3 mb-3 items-center gap-3"
      activeOpacity={0.7}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          className="w-16 h-16 rounded-lg bg-gray-700"
        />
      ) : (
        <View className="w-16 h-16 rounded-lg bg-gray-700 items-center justify-center">
          <Text className="text-2xl">🎙️</Text>
        </View>
      )}
      <View className="flex-1">
        <Text className="text-white font-semibold text-sm" numberOfLines={2}>{title}</Text>
        {author ? (
          <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>{author}</Text>
        ) : null}
        {description ? (
          <Text className="text-gray-500 text-xs mt-1" numberOfLines={2}>{description}</Text>
        ) : null}
      </View>
      <Text className="text-gray-500 text-lg">›</Text>
    </TouchableOpacity>
  );
}
