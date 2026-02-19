import { useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { formatTimestamp } from '@/lib/api';
import type { TranscriptSegment } from '@/lib/types';

// Distinct colors for up to 8 speakers
const SPEAKER_COLORS: Record<string, string> = {
  SPEAKER_00: '#818CF8', // indigo
  SPEAKER_01: '#34D399', // emerald
  SPEAKER_02: '#F59E0B', // amber
  SPEAKER_03: '#F472B6', // pink
  SPEAKER_04: '#60A5FA', // blue
  SPEAKER_05: '#A78BFA', // violet
  SPEAKER_06: '#FB923C', // orange
  SPEAKER_07: '#4ADE80', // green
};

function getSpeakerColor(speaker: string | undefined): string {
  if (!speaker) return '#D1D5DB';
  return SPEAKER_COLORS[speaker] ?? '#D1D5DB';
}

interface TranscriptViewerProps {
  segments: TranscriptSegment[];
  currentPosition: number; // seconds
  onSeek: (seconds: number) => void;
}

export function TranscriptViewer({ segments, currentPosition, onSeek }: TranscriptViewerProps) {
  const listRef = useRef<FlatList>(null);

  // Find the currently active segment
  const activeIndex = segments.findIndex(
    (seg) => currentPosition >= seg.start && currentPosition < seg.end
  );

  // Auto-scroll to active segment
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      listRef.current.scrollToIndex({ index: activeIndex, animated: true, viewPosition: 0.3 });
    }
  }, [activeIndex]);

  return (
    <FlatList
      ref={listRef}
      data={segments}
      keyExtractor={(_, i) => String(i)}
      renderItem={({ item, index }) => (
        <SegmentRow
          segment={item}
          isActive={index === activeIndex}
          onPress={() => onSeek(item.start)}
        />
      )}
      contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 16 }}
      showsVerticalScrollIndicator={false}
      onScrollToIndexFailed={() => {}}
    />
  );
}

function SegmentRow({
  segment,
  isActive,
  onPress,
}: {
  segment: TranscriptSegment;
  isActive: boolean;
  onPress: () => void;
}) {
  const speakerColor = getSpeakerColor(segment.speaker);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`py-3 border-l-2 pl-3 mb-1 rounded-r-lg ${isActive ? 'bg-indigo-950' : ''}`}
      style={{ borderLeftColor: isActive ? '#6366F1' : 'transparent' }}
    >
      <View className="flex-row items-center gap-2 mb-1">
        <Text className="text-xs font-mono" style={{ color: speakerColor }}>
          {segment.speaker ?? 'Speaker'}
        </Text>
        <Text className="text-gray-500 text-xs">{formatTimestamp(segment.start)}</Text>
      </View>
      <Text
        className={`text-sm leading-relaxed ${isActive ? 'text-white' : 'text-gray-300'}`}
      >
        {segment.text.trim()}
      </Text>
    </TouchableOpacity>
  );
}

interface ChapterListProps {
  chapters: Array<{ title: string; timestamp: number; summary: string }>;
  onSeek: (seconds: number) => void;
}

export function ChapterList({ chapters, onSeek }: ChapterListProps) {
  return (
    <View className="px-4">
      {chapters.map((chapter, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onSeek(chapter.timestamp)}
          className="flex-row items-start gap-3 py-3 border-b border-gray-800"
          activeOpacity={0.7}
        >
          <Text className="text-indigo-400 text-xs font-mono mt-0.5 w-12">
            {formatTimestamp(chapter.timestamp)}
          </Text>
          <View className="flex-1">
            <Text className="text-white text-sm font-medium">{chapter.title}</Text>
            <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={2}>
              {chapter.summary}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
