import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Audio } from 'expo-av';
import { formatDuration } from '@/lib/api';
import { useStore } from '@/store/useStore';

interface AudioPlayerProps {
  audioUrl: string;
  onPositionChange?: (position: number) => void;
}

export function AudioPlayer({ audioUrl, onPositionChange }: AudioPlayerProps) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { isPlaying, playbackPosition, setIsPlaying, setPlaybackPosition } = useStore();

  // Load audio
  useEffect(() => {
    let mounted = true;

    async function loadAudio() {
      setIsLoading(true);
      setError(null);
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: true,
        });

        const { sound, status } = await Audio.Sound.createAsync(
          { uri: audioUrl },
          { shouldPlay: false, progressUpdateIntervalMillis: 500 },
          (status) => {
            if (!mounted || !status.isLoaded) return;
            setPlaybackPosition(status.positionMillis / 1000);
            onPositionChange?.(status.positionMillis / 1000);
            if (status.didJustFinish) {
              setIsPlaying(false);
              setPlaybackPosition(0);
            }
          }
        );

        if (!mounted) {
          await sound.unloadAsync();
          return;
        }

        soundRef.current = sound;
        if (status.isLoaded && status.durationMillis) {
          setDuration(status.durationMillis / 1000);
        }
      } catch (e: any) {
        if (mounted) setError('Failed to load audio.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    loadAudio();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, [audioUrl]);

  const togglePlayPause = useCallback(async () => {
    if (!soundRef.current) return;
    if (isPlaying) {
      await soundRef.current.pauseAsync();
      setIsPlaying(false);
    } else {
      await soundRef.current.playAsync();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const seek = useCallback(async (seconds: number) => {
    if (!soundRef.current) return;
    await soundRef.current.setPositionAsync(seconds * 1000);
    setPlaybackPosition(seconds);
  }, []);

  const seekRelative = useCallback(async (delta: number) => {
    await seek(Math.max(0, Math.min(duration, playbackPosition + delta)));
  }, [playbackPosition, duration, seek]);

  const progress = duration > 0 ? playbackPosition / duration : 0;

  if (error) {
    return (
      <View className="bg-gray-800 rounded-xl p-4 items-center">
        <Text className="text-red-400 text-sm">{error}</Text>
      </View>
    );
  }

  return (
    <View className="bg-gray-800 rounded-xl p-4">
      {/* Progress bar */}
      <TouchableOpacity
        onPress={(e) => {
          const { locationX, target } = e.nativeEvent;
          // Simple tap seek - would need layout measurement for precise seeking
        }}
        activeOpacity={1}
      >
        <View className="h-1.5 bg-gray-600 rounded-full mb-3">
          <View
            className="h-full bg-indigo-500 rounded-full"
            style={{ width: `${progress * 100}%` }}
          />
        </View>
      </TouchableOpacity>

      {/* Time labels */}
      <View className="flex-row justify-between mb-4">
        <Text className="text-gray-400 text-xs">{formatDuration(playbackPosition)}</Text>
        <Text className="text-gray-400 text-xs">{formatDuration(duration)}</Text>
      </View>

      {/* Controls */}
      <View className="flex-row items-center justify-center gap-8">
        <TouchableOpacity onPress={() => seekRelative(-15)} className="p-2">
          <Text className="text-white text-sm">-15s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={togglePlayPause}
          disabled={isLoading}
          className="bg-indigo-500 w-14 h-14 rounded-full items-center justify-center"
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-xl">{isPlaying ? '⏸' : '▶'}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => seekRelative(15)} className="p-2">
          <Text className="text-white text-sm">+15s</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
