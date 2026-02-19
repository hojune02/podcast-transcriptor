import { View, Text, TouchableOpacity, SafeAreaView, Alert, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { useStore } from '@/store/useStore';
import { signOut } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session } = useStore();
  const [signingOut, setSigningOut] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const [transcripts, jobs] = await Promise.all([
        supabase.from('transcripts').select('id', { count: 'exact', head: true }),
        supabase.from('transcription_jobs').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
      ]);
      return {
        transcriptCount: transcripts.count ?? 0,
        completedJobs: jobs.count ?? 0,
      };
    },
    enabled: !!session,
  });

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await signOut();
            router.replace('/(auth)/login');
          } catch {
            Alert.alert('Error', 'Failed to sign out.');
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-950">
      <View className="flex-1 px-4 pt-4">
        <Text className="text-white text-2xl font-bold mb-6">Profile</Text>

        {/* User info */}
        <View className="bg-gray-800 rounded-xl p-4 mb-4">
          <View className="w-16 h-16 rounded-full bg-indigo-500 items-center justify-center mb-3">
            <Text className="text-white text-2xl font-bold">
              {session?.user.email?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text className="text-white font-semibold text-base">{session?.user.email}</Text>
          <Text className="text-gray-400 text-xs mt-1">
            Member since {new Date(session?.user.created_at ?? '').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>

        {/* Stats */}
        <View className="flex-row gap-3 mb-4">
          <StatCard label="Transcripts" value={stats?.transcriptCount ?? '—'} />
          <StatCard label="Episodes Processed" value={stats?.completedJobs ?? '—'} />
        </View>

        {/* Account section */}
        <View className="bg-gray-800 rounded-xl overflow-hidden mb-4">
          <MenuRow label="Subscription" value="Free" />
          <MenuRow label="Transcriptions Used" value={`${stats?.completedJobs ?? 0} / ∞`} />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={handleSignOut}
          disabled={signingOut}
          className="bg-red-900 rounded-xl py-4 items-center"
        >
          {signingOut ? (
            <ActivityIndicator color="#FCA5A5" />
          ) : (
            <Text className="text-red-300 font-semibold">Sign Out</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1 bg-gray-800 rounded-xl p-4 items-center">
      <Text className="text-white text-2xl font-bold">{value}</Text>
      <Text className="text-gray-400 text-xs mt-1 text-center">{label}</Text>
    </View>
  );
}

function MenuRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-700 last:border-0">
      <Text className="text-white text-sm">{label}</Text>
      <Text className="text-gray-400 text-sm">{value}</Text>
    </View>
  );
}
