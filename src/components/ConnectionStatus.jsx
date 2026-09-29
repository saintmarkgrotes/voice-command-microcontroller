import { View, Text } from "react-native";

// Full class names are listed explicitly so Tailwind can detect them at build time.
const VARIANTS = {
  checking: { dot: "bg-slate-400", text: "text-slate-300", label: "Checking…" },
  connected: {
    dot: "bg-emerald-400",
    text: "text-emerald-400",
    label: "Connected",
  },
  disconnected: {
    dot: "bg-rose-500",
    text: "text-rose-400",
    label: "Disconnected",
  },
  mock: { dot: "bg-amber-400", text: "text-amber-400", label: "Mock API" },
};

export default function ConnectionStatus({
  status = "checking",
  mock = false,
}) {
  // In mock mode a "connected" state is shown as Mock so it is never mistaken for a real backend.
  const key = mock && status === "connected" ? "mock" : status;
  const variant = VARIANTS[key] || VARIANTS.checking;

  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-slate-400">Backend</Text>
      <View
        className="flex-row items-center"
        accessibilityLabel={`Backend: ${variant.label}`}
      >
        <View className={`mr-2 h-2.5 w-2.5 rounded-full ${variant.dot}`} />
        <Text className={`text-sm font-semibold ${variant.text}`}>
          {variant.label}
        </Text>
      </View>
    </View>
  );
}
