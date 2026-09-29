import { View, Text } from "react-native";

export default function SecurityStatus({ label = "AES-GCM" }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-slate-400">Security</Text>
      <Text className="text-sm font-semibold text-cyan-400">🔐 {label}</Text>
    </View>
  );
}
