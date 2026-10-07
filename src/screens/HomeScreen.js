import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CommandResult from "../components/CommandResult";
import ConnectionStatus from "../components/ConnectionStatus";
import DeviceCard from "../components/DeviceCard";
import Header from "../components/Header";
import MockVoiceInput from "../components/MockVoiceInput";
import SectionCard from "../components/SectionCard";
import SecurityStatus from "../components/SecurityStatus";
import VoiceCommandButton from "../components/VoiceCommandButton";
import VoiceFeedback from "../components/VoiceFeedback";
import useDevices from "../hooks/useDevices";
import useVoiceCommand from "../hooks/useVoiceCommand";

export default function HomeScreen() {
  const {
    devices,
    connection,
    isSending,
    lastResult,
    sendCommand,
    isMockMode,
  } = useDevices();

  // Voice and buttons share ONE command flow: a recognized phrase becomes a
  // COMMAND_TYPES value and goes through sendCommand, exactly like a button press.
  const voice = useVoiceCommand({ onCommand: sendCommand });

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        contentContainerClassName="px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Header />

        <SectionCard>
          <VoiceCommandButton
            isListening={voice.isListening}
            onPress={voice.toggleListening}
            disabled={isSending}
            listeningLabel="Type your command below"
          />
          {voice.isListening ? (
            <MockVoiceInput
              onSubmit={voice.submitTranscript}
              onCancel={voice.stopListening}
              disabled={isSending}
            />
          ) : null}
          <VoiceFeedback feedback={voice.feedback} />
        </SectionCard>

        <SectionCard title="Device Control">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onCommand={sendCommand}
              disabled={isSending}
            />
          ))}
        </SectionCard>

        <SectionCard title="System">
          <ConnectionStatus status={connection} mock={isMockMode} />
          <SecurityStatus />
        </SectionCard>

        <SectionCard title="Last Result">
          <CommandResult result={lastResult} mock={isMockMode} />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}