import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Podcast, Episode } from '@/lib/types';

interface AppState {
  // Auth
  session: Session | null;
  setSession: (session: Session | null) => void;

  // Current playback
  currentEpisode: Episode | null;
  playbackPosition: number; // seconds
  isPlaying: boolean;
  setCurrentEpisode: (episode: Episode | null) => void;
  setPlaybackPosition: (position: number) => void;
  setIsPlaying: (playing: boolean) => void;

  // Browse state (ephemeral - survives tab switches)
  selectedPodcast: Podcast | null;
  setSelectedPodcast: (podcast: Podcast | null) => void;
}

export const useStore = create<AppState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),

  currentEpisode: null,
  playbackPosition: 0,
  isPlaying: false,
  setCurrentEpisode: (episode) => set({ currentEpisode: episode, playbackPosition: 0, isPlaying: false }),
  setPlaybackPosition: (position) => set({ playbackPosition: position }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  selectedPodcast: null,
  setSelectedPodcast: (podcast) => set({ selectedPodcast: podcast }),
}));
