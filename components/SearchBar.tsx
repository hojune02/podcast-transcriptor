import { View, TextInput, TouchableOpacity, Text } from 'react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, onSubmit, placeholder = 'Search podcasts or paste URL…' }: SearchBarProps) {
  return (
    <View className="flex-row items-center bg-gray-800 rounded-xl px-4 gap-2">
      <Text className="text-gray-400 text-lg">🔍</Text>
      <TextInput
        className="flex-1 text-white py-4 text-base"
        placeholder={placeholder}
        placeholderTextColor="#6B7280"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Text className="text-gray-400 text-lg px-1">✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
