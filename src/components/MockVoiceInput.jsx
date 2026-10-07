import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { MAX_TRANSCRIPT_LENGTH } from "../services/voice/voiceGrammar";

const SAMPLE_PHRASES = [
  "turn on the light",
  "switch off the fan",
  "open the door",
  "stop the water pump",
];

// Stand-in for the microphone while real speech recognition is not installed.
// The person types what they WOULD say; the text goes through the same parser
// and command flow that real speech will use.
export default function MockVoiceInput({
  onSubmit,
  onCancel,
  disabled = false,
}) {
  const [text, setText] = useState("");
  const canSubmit = !disabled && text.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(text);
    setText("");
  };

  return (
    <View className="mt-3 rounded-xl bg-slate-800 p-3">
      <Text className="text-xs font-semibold uppercase tracking-widest text-amber-400">
        Mock voice input
      </Text>
      <Text className="mt-1 text-xs text-slate-400">
        Type what you would say. Real speech recognition replaces this later.
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="send"
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={MAX_TRANSCRIPT_LENGTH}
        editable={!disabled}
        placeholder='e.g. "turn on the light"'
        placeholderTextColor="#64748b" // native prop, not a style; NativeWind cannot set it
        accessibilityLabel="Type a voice command"
        className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-base text-white"
      />

      <View className="mt-3 flex-row flex-wrap">
        {SAMPLE_PHRASES.map((phrase) => (
          <Pressable
            key={phrase}
            onPress={() => setText(phrase)}
            accessibilityRole="button"
            accessibilityLabel={`Use example: ${phrase}`}
            className="mb-2 mr-2 rounded-full bg-slate-700 px-3 py-1 active:opacity-70"
          >
            <Text className="text-xs text-slate-200">{phrase}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-1 flex-row gap-3">
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Send voice command"
          accessibilityState={{ disabled: !canSubmit }}
          className={`flex-1 items-center rounded-lg bg-cyan-500 py-3 active:opacity-70 ${
            canSubmit ? "" : "opacity-50"
          }`}
        >
          <Text className="text-sm font-bold text-slate-950">SEND</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel voice command"
          className="flex-1 items-center rounded-lg bg-slate-700 py-3 active:opacity-70"
        >
          <Text className="text-sm font-bold text-slate-200">CANCEL</Text>
        </Pressable>
      </View>
    </View>
  );
}