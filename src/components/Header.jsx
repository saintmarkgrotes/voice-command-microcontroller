import { View, Text } from "react-native";

export default function Header({
  title = "Smart Home",
  subtitle = "Control Center",
}) {
  return (
    <View className="items-center pb-2 pt-4">
      <Text className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
        {title}
      </Text>
      <Text className="mt-1 text-3xl font-bold text-white">{subtitle}</Text>
    </View>
  );
}
