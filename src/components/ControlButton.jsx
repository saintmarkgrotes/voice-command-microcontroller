import { Text, Pressable } from "react-native";

export default function ControlButton({
  label,
  onPress,
  selected = false,
  disabled = false,
  accessibilityLabel,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled, selected }}
      className={`flex-1 items-center rounded-lg py-3 active:opacity-70 ${
        selected ? "bg-cyan-500" : "bg-slate-700"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-sm font-bold tracking-wide ${
          selected ? "text-slate-950" : "text-slate-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
