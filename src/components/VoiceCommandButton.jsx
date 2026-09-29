import { View, Text, Pressable } from "react-native";

export default function VoiceCommandButton({
  isListening = false,
  onPress,
  disabled = false,
}) {
  return (
    <View className="items-center py-2">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={
          isListening ? "Stop listening" : "Start voice command"
        }
        accessibilityState={{ disabled, busy: isListening }}
        className={`h-24 w-24 items-center justify-center rounded-full active:opacity-80 ${
          isListening ? "bg-rose-500" : "bg-cyan-500"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <Text className="text-4xl">🎙️</Text>
      </Pressable>

      <Text className="mt-3 text-base font-semibold text-white">
        Voice Command
      </Text>
      <Text className="mt-1 text-sm text-slate-400">
        {isListening ? "Listening…" : '"Tap to speak"'}
      </Text>
    </View>
  );
}
