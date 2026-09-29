import { View, Text } from "react-native";

import ControlButton from "./ControlButton";
import DeviceStatus from "./DeviceStatus";

// `device` is a view model: { id, name, icon, state, tone, actions: [{ label, command, selected }] }.
// The card never builds commands itself; it reports which COMMAND_TYPES value was pressed.
export default function DeviceCard({ device, onCommand, disabled = false }) {
  return (
    <View className="mb-3 rounded-xl bg-slate-800/60 p-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center">
          <Text className="mr-3 text-2xl">{device.icon}</Text>
          <Text className="text-lg font-semibold text-white">
            {device.name}
          </Text>
        </View>
        <DeviceStatus state={device.state} tone={device.tone} />
      </View>

      <View className="mt-3 flex-row gap-3">
        {device.actions.map((action) => (
          <ControlButton
            key={action.command}
            label={action.label}
            selected={action.selected}
            disabled={disabled}
            onPress={() => onCommand(action.command)}
            accessibilityLabel={`${device.name} ${action.label}`}
          />
        ))}
      </View>
    </View>
  );
}
