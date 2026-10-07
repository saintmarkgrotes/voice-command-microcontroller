import { View, Text } from "react-native";

// Shows what the parser understood from the last spoken (or typed) phrase.
// `feedback` is null or { ok, transcript, command?, message? }.
export default function VoiceFeedback({ feedback }) {
  if (!feedback) return null;

  return (
    <View
      className="mt-3 rounded-xl bg-slate-800 p-3"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-xs font-semibold uppercase tracking-widest text-slate-400">
        Heard
      </Text>
      <Text className="mt-1 text-base text-white">“{feedback.transcript}”</Text>
      <Text
        className={`mt-2 text-sm font-semibold ${
          feedback.ok ? "text-emerald-400" : "text-amber-400"
        }`}
      >
        {feedback.ok ? `✓ Understood: ${feedback.command}` : feedback.message}
      </Text>
    </View>
  );
}