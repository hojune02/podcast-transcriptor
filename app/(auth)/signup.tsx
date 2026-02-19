import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Link, router } from 'expo-router';
import { signUp } from '@/lib/api';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignUp() {
    if (!email || !password || !confirm) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signUp(email.trim(), password);
      setSuccess(true);
    } catch (e: any) {
      setError(e.message ?? 'Sign up failed.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View className="flex-1 bg-gray-950 justify-center items-center px-6">
        <Text className="text-3xl text-white font-bold mb-4">Check your email</Text>
        <Text className="text-gray-400 text-center text-base mb-8">
          We sent a confirmation link to {email}. Confirm your email, then sign in.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/(auth)/login')}
          className="bg-indigo-500 rounded-xl py-4 px-8"
        >
          <Text className="text-white font-semibold text-base">Go to Sign In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gray-950"
    >
      <View className="flex-1 justify-center px-6">
        <View className="items-center mb-10">
          <Text className="text-4xl font-bold text-white">Create Account</Text>
          <Text className="text-gray-400 mt-2 text-base">Join PodScribe today</Text>
        </View>

        <View className="gap-4">
          <TextInput
            className="bg-gray-800 text-white rounded-xl px-4 py-4 text-base"
            placeholder="Email"
            placeholderTextColor="#6B7280"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="bg-gray-800 text-white rounded-xl px-4 py-4 text-base"
            placeholder="Password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <TextInput
            className="bg-gray-800 text-white rounded-xl px-4 py-4 text-base"
            placeholder="Confirm Password"
            placeholderTextColor="#6B7280"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />

          {error && (
            <Text className="text-red-400 text-sm text-center">{error}</Text>
          )}

          <TouchableOpacity
            onPress={handleSignUp}
            disabled={loading}
            className="bg-indigo-500 rounded-xl py-4 items-center mt-2"
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Create Account</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="flex-row justify-center mt-6">
          <Text className="text-gray-400">Already have an account? </Text>
          <Link href="/(auth)/login">
            <Text className="text-indigo-400 font-semibold">Sign In</Text>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
