import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { getTranscript, getJob } from '@/lib/api';
import { AudioPlayer } from '@/components/AudioPlayer';
import { TranscriptViewer, ChapterList } from '@/components/TranscriptViewer';
import { useStore } from '@/store/useStore';

type TabType = 'transcript' | 'summary' | 'chapters';

export default function TranscriptScreen() {
  const { id, isJob } = useLocalSearchParams<{ id: string; isJob?: string }>();
  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const { playbackPosition } = useStore();

  const isJobView = isJob === 'true';

  // If this is a job (in-progress transcription), poll the job status
  const {
    data: job,
    isLoading: isJobLoading,
  } = useQuery({
    queryKey: ['job', id],
    queryFn: () => getJob(id),
    enabled: isJobView,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'completed' || status === 'failed') return false;
      return 3000; // poll every 3s
    },
  });

  // Once job completes, redirect to the actual transcript
  const completedTranscriptId = job?.status === 'completed' ? job.id : undefined;

  const {
    data: transcript,
    isLoading: isTranscriptLoading,
    error: transcriptError,
  } = useQuery({
    queryKey: ['transcript', isJobView ? completedTranscriptId : id],
    queryFn: () => getTranscript(isJobView ? completedTranscriptId! : id),
    enabled: isJobView ? !!completedTranscriptId : true,
  });

  const handleSeek = useCallback((seconds: number) => {
    // AudioPlayer listens to store; update via store indirectly handled by AudioPlayer's seek
  }, []);

  // ─── Loading / job progress ────────────────────────────────────────────────
  if (isJobView && (!job || job.status === 'queued' || job.status === 'processing')) {
    const progress = job?.progress ?? 0;
    const statusLabel = job?.status === 'queued' ? 'Queued…' : `Transcribing… ${progress}%`;

    return (
      <SafeAreaView className="flex-1 bg-gray-950 items-center justify-center px-6">
        <Text className="text-4xl mb-6">🎙️</Text>
        <Text className="text-white text-xl font-semibold mb-2">
          {job?.episode?.title ?? 'Processing…'}
        </Text>
        <Text className="text-gray-400 mb-8 text-sm text-center">
          WhisperX is transcribing your episode. This takes 2-5 minutes.
        </Text>

        {/* Progress bar */}
        <View className="w-full h-2 bg-gray-800 rounded-full mb-3">
          <View
            className="h-full bg-indigo-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </View>
        <Text className="text-indigo-400 text-sm">{statusLabel}</Text>

        {job?.status === 'failed' && (
          <View className="mt-8 items-center">
            <Text className="text-red-400 text-center mb-2">Transcription failed.</Text>
            {job.error_message && (
              <Text className="text-gray-500 text-xs text-center">{job.error_message}</Text>
            )}
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ─── Error ─────────────────────────────────────────────────────────────────
  if (transcriptError) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950 items-center justify-center px-6">
        <Text className="text-red-400 text-center">Failed to load transcript.</Text>
      </SafeAreaView>
    );
  }

  // ─── Loading transcript ────────────────────────────────────────────────────
  if (isTranscriptLoading || !transcript) {
    return (
      <SafeAreaView className="flex-1 bg-gray-950 items-center justify-center">
        <ActivityIndicator color="#6366F1" size="large" />
      </SafeAreaView>
    );
  }

  const episode = transcript.episode;
  const segments = transcript.segments ?? [];
  const chapters = transcript.chapters ?? [];

  return (
    <View className="flex-1 bg-gray-950">
      <Stack.Screen
        options={{
          title: episode?.title ?? 'Transcript',
          headerStyle: { backgroundColor: '#030712' },
          headerTintColor: '#fff',
        }}
      />

      {/* Summary header (always visible) */}
      {transcript.summary && (
        <View className="bg-gray-900 px-4 py-3 border-b border-gray-800">
          <Text className="text-indigo-400 text-xs font-semibold uppercase tracking-wide mb-1">
            AI Summary
          </Text>
          <Text className="text-gray-300 text-sm leading-relaxed">{transcript.summary}</Text>
          {transcript.key_topics && transcript.key_topics.length > 0 && (
            <View className="flex-row flex-wrap gap-2 mt-2">
              {transcript.key_topics.map((topic, i) => (
                <View key={i} className="bg-gray-800 rounded-full px-3 py-1">
                  <Text className="text-gray-300 text-xs">{topic}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Tab selector */}
      <View className="flex-row bg-gray-900 border-b border-gray-800">
        {(['transcript', 'chapters', 'summary'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveTab(tab)}
            className={`flex-1 py-3 items-center ${activeTab === tab ? 'border-b-2 border-indigo-500' : ''}`}
          >
            <Text
              className={`text-sm font-medium capitalize ${activeTab === tab ? 'text-indigo-400' : 'text-gray-500'}`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab content */}
      <View className="flex-1">
        {activeTab === 'transcript' && segments.length > 0 && (
          <TranscriptViewer
            segments={segments}
            currentPosition={playbackPosition}
            onSeek={handleSeek}
          />
        )}

        {activeTab === 'transcript' && segments.length === 0 && (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-400">No transcript segments available.</Text>
          </View>
        )}

        {activeTab === 'chapters' && chapters.length > 0 && (
          <ScrollView>
            <ChapterList chapters={chapters} onSeek={handleSeek} />
          </ScrollView>
        )}

        {activeTab === 'chapters' && chapters.length === 0 && (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-400">No chapters generated.</Text>
          </View>
        )}

        {activeTab === 'summary' && (
          <ScrollView className="px-4 py-4">
            {transcript.summary ? (
              <>
                <Text className="text-white text-base leading-relaxed">{transcript.summary}</Text>
                {transcript.key_topics && transcript.key_topics.length > 0 && (
                  <View className="mt-6">
                    <Text className="text-gray-400 text-sm font-semibold mb-3">Key Topics</Text>
                    {transcript.key_topics.map((topic, i) => (
                      <View key={i} className="flex-row items-center gap-2 mb-2">
                        <View className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <Text className="text-gray-300 text-sm">{topic}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View className="flex-1 items-center justify-center pt-20">
                <Text className="text-gray-400">Summary not yet generated.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>

      {/* Sticky audio player at bottom */}
      {episode?.audio_url && (
        <View className="px-4 pb-4 pt-2 bg-gray-900 border-t border-gray-800">
          <AudioPlayer
            audioUrl={episode.audio_url}
            onPositionChange={() => {}}
          />
        </View>
      )}
    </View>
  );
}
