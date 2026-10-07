import { View, Text } from "react-native";

// Shown while the backend cannot be reached. The device cards then show the
// LAST KNOWN states, which may be out of date.
export default function OfflineBanner({ visible = false }) {
  if (!visible) return null;

  return (
    <View
      className="mt-4 rounded-xl bg-rose-950 p-3"
      accessibilityRole="alert"
    >
      <Text className="text-sm font-semibold text-rose-300">
        ⚠️ Offline: showing the last known device states.
      </Text>
      <Text className="mt-1 text-xs text-rose-300">
        Pull down to try again.
      </Text>
    </View>
  );
}