import { View, Text } from "react-native";

const preview = (value) =>
  value.length > 24 ? `${value.slice(0, 24)}…` : value;

function Row({ label, value }) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className="text-xs text-slate-400">{label}</Text>
      <Text className="ml-4 flex-1 text-right font-mono text-xs text-cyan-300">
        {value}
      </Text>
    </View>
  );
}

// Shows the outcome of the most recent command.
// The ciphertext is truncated; this card exists to verify the flow during development.
export default function CommandResult({ result, mock = false }) {
  if (!result) {
    return <Text className="text-sm text-slate-400">No command sent yet.</Text>;
  }

  if (!result.ok) {
    return (
      <View className="rounded-lg bg-rose-950 p-3" accessibilityRole="alert">
        <Text className="text-sm text-rose-300">{result.message}</Text>
      </View>
    );
  }

  const { command, commandId, encryptedPayload } = result;

  return (
    <View accessibilityLiveRegion="polite">
      <Text className="text-sm font-semibold text-emerald-400">
        ✓ Command secured
      </Text>
      <Text className="mt-1 text-sm font-semibold text-emerald-400">
        ✓ Backend processed command
      </Text>

      {mock ? (
        <Text className="mt-2 text-xs text-amber-400">
          Mock mode: the payload is simulated, not real encryption.
        </Text>
      ) : null}

      <View className="mt-3 rounded-lg bg-slate-950 p-3">
        <Row label="Command" value={command.command} />
        <Row label="ID" value={commandId} />
        <Row label="Algorithm" value={encryptedPayload.algorithm} />
        <Row label="Nonce" value={preview(encryptedPayload.nonce)} />
        <Row label="Ciphertext" value={preview(encryptedPayload.ciphertext)} />
        <Row label="Tag" value={preview(encryptedPayload.tag)} />
      </View>
    </View>
  );
}