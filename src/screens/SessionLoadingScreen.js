import { ActivityIndicator, Text, View } from "react-native";

// Shown for a moment while the saved session is read from secure storage.
export default function SessionLoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-950">
      <ActivityIndicator size="large" color="#22d3ee" />
      <Text className="mt-4 text-sm text-slate-400">Loading…</Text>
    </View>
  );
}