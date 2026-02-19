import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { SearchBar } from '@/components/SearchBar';
import { PodcastCard } from '@/components/PodcastCard';
import { EpisodeCard } from '@/components/EpisodeCard';
import { searchPodcasts, fetchPodcastEpisodes, startTranscription, getTranscriptByEpisode } from '@/lib/api';
import { useStore } from '@/store/useStore';
import type { PodcastIndexResult, Episode } from '@/lib/types';

type ViewState = 'search' | 'episodes';

export default function HomeScreen() {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>('search');
  const [selectedFeedUrl, setSelectedFeedUrl] = useState<string | null>(null);
  const { selectedPodcast, setSelectedPodcast } = useStore();
  const queryClient = useQueryClient();

  // Search results
  const {
    data: searchResults,
    isFetching: isSearching,
    refetch: doSearch,
    error: searchError,
  } = useQuery({
    queryKey: ['podcast-search', query],
    queryFn: () => searchPodcasts(query),
    enabled: false,
  });

  // Episode list
  const {
    data: episodeData,
    isFetching: isLoadingEpisodes,
    error: episodeError,
  } = useQuery({
    queryKey: ['episodes', selectedFeedUrl],
    queryFn: () => fetchPodcastEpisodes(selectedFeedUrl!),
    enabled: !!selectedFeedUrl,
  });

  // Start transcription mutation
  const transcribeMutation = useMutation({
    mutationFn: async (episode: Episode) => {
      const job = await startTranscription(episode.id);
      return { job, episode };
    },
    onSuccess: ({ job }) => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push(`/transcript/${job.id}?isJob=true`);
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message ?? 'Failed to start transcription.');
    },
  });

  function handleSearch() {
    if (query.trim()) doSearch();
  }

  function handleSelectPodcast(podcast: PodcastIndexResult) {
    setSelectedPodcast({
      id: String(podcast.id),
      title: podcast.title,
      author: podcast.author,
      description: podcast.description,
      image_url: podcast.image,
      rss_feed_url: podcast.url,
      spotify_url: null,
      apple_url: null,
      created_at: new Date().toISOString(),
    });
    setSelectedFeedUrl(podcast.url);
    setView('episodes');
  }

  function handleTranscribeOrView(episode: Episode) {
    queryClient
      .fetchQuery({
        queryKey: ['transcript-check', episode.id],
        queryFn: () => getTranscriptByEpisode(episode.id),
        staleTime: 0,
      })
      .then((transcript) => {
        if (transcript) {
          router.push(`/transcript/${transcript.id}`);
        } else {
          transcribeMutation.mutate(episode);
        }
      })
      .catch(() => {
        transcribeMutation.mutate(episode);
      });
  }

  const renderSearchContent = useCallback(() => {
    if (isSearching) {
      return (
        <View className="flex-1 items-center justify-center pt-20">
          <ActivityIndicator color="#6366F1" size="large" />
        </View>
      );
    }

    if (searchError) {
      return (
        <View className="flex-1 items-center justify-center pt-20 px-6">
          <Text className="text-red-400 text-center">Search failed. Check your connection.</Text>
        </View>
      );
    }

    if (searchResults && searchResults.length === 0) {
      return (
        <View className="flex-1 items-center justify-center pt-20">
          <Text className="text-gray-400 text-center">No podcasts found.</Text>
        </View>
      );
    }

    if (!searchResults) {
      return (
        <View className="flex-1 items-center justify-center pt-20 px-6">
          <Text className="text-5xl mb-4">🎙️</Text>
          <Text className="text-white text-xl font-semibold text-center">Find Your Podcast</Text>
          <Text className="text-gray-400 text-center mt-2 text-sm">
            Search by name, or paste a Spotify or Apple Podcasts URL
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={searchResults}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <PodcastCard podcast={item} onPress={() => handleSelectPodcast(item)} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    );
  }, [isSearching, searchError, searchResults]);

  return (
    <SafeAreaView className="flex-1 bg-gray-950">
      <View className="flex-1 px-4 pt-4">
        {/* Header */}
        <View className="flex-row items-center mb-4">
          {view === 'episodes' && (
            <TouchableOpacity onPress={() => setView('search')} className="mr-3 py-1">
              <Text className="text-indigo-400 text-base">← Back</Text>
            </TouchableOpacity>
          )}
          <Text className="text-white text-2xl font-bold">
            {view === 'episodes' && selectedPodcast ? selectedPodcast.title : 'PodScribe'}
          </Text>
        </View>

        {/* Search bar */}
        {view === 'search' && (
          <View className="mb-4">
            <SearchBar value={query} onChangeText={setQuery} onSubmit={handleSearch} />
          </View>
        )}

        {/* Content */}
        {view === 'search' ? (
          renderSearchContent()
        ) : (
          <EpisodeListView
            episodes={episodeData?.episodes ?? []}
            isLoading={isLoadingEpisodes}
            error={episodeError}
            onTranscribe={handleTranscribeOrView}
            isTranscribing={transcribeMutation.isPending}
            transcribingEpisodeId={transcribeMutation.variables?.id}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function EpisodeListView({
  episodes,
  isLoading,
  error,
  onTranscribe,
  isTranscribing,
  transcribingEpisodeId,
}: {
  episodes: Episode[];
  isLoading: boolean;
  error: unknown;
  onTranscribe: (e: Episode) => void;
  isTranscribing: boolean;
  transcribingEpisodeId?: string;
}) {
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#6366F1" size="large" />
        <Text className="text-gray-400 mt-3">Loading episodes…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-red-400 text-center">Failed to load episodes.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={episodes}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <EpisodeCard
          episode={item}
          onTranscribe={() => onTranscribe(item)}
          isTranscribing={isTranscribing && transcribingEpisodeId === item.id}
        />
      )}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View className="items-center justify-center pt-20">
          <Text className="text-gray-400">No episodes found.</Text>
        </View>
      }
    />
  );
}
