import { View, Text } from "react-native";

export default function SectionCard({ title, children }) {
  return (
    <View className="mt-4 rounded-2xl bg-slate-900 p-4">
      {title ? (
        <Text
          accessibilityRole="header"
          className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400"
        >
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
