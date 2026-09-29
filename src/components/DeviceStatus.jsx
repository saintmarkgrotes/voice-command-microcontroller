import { View, Text } from "react-native";

// Full class names are listed explicitly so Tailwind can detect them at build time.
const TONES = {
  active: { dot: "bg-emerald-400", text: "text-emerald-400" },
  warning: { dot: "bg-amber-400", text: "text-amber-400" },
  inactive: { dot: "bg-slate-500", text: "text-slate-400" },
};

export default function DeviceStatus({ state, tone = "inactive" }) {
  const styles = TONES[tone] || TONES.inactive;

  return (
    <View
      className="flex-row items-center"
      accessibilityLabel={`Status: ${state}`}
    >
      <View className={`mr-2 h-2.5 w-2.5 rounded-full ${styles.dot}`} />
      <Text className={`text-sm font-bold uppercase ${styles.text}`}>
        {state}
      </Text>
    </View>
  );
}
