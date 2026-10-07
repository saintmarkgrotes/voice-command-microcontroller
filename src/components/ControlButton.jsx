import { ActivityIndicator, Text, Pressable } from "react-native";

export default function ControlButton({
  label,
  onPress,
  selected = false,
  disabled = false,
  loading = false,
  accessibilityLabel,
}) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: isDisabled, selected, busy: loading }}
      className={`min-h-11 flex-1 items-center justify-center rounded-lg py-3 active:opacity-70 ${
        selected ? "bg-cyan-500" : "bg-slate-700"
      } ${disabled && !loading ? "opacity-50" : ""}`}
    >
      {loading ? (
        // native prop; NativeWind cannot set it
        <ActivityIndicator
          size="small"
          color={selected ? "#020617" : "#e2e8f0"}
        />
      ) : (
        <Text
          className={`text-sm font-bold tracking-wide ${
            selected ? "text-slate-950" : "text-slate-200"
          }`}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}