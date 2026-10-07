import { RefreshControl, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AccountStatus from "../components/AccountStatus";
import CommandResult from "../components/CommandResult";
import ConnectionStatus from "../components/ConnectionStatus";
import DeviceCard from "../components/DeviceCard";
import Header from "../components/Header";
import MockVoiceInput from "../components/MockVoiceInput";
import OfflineBanner from "../components/OfflineBanner";
import SectionCard from "../components/SectionCard";
import SecurityStatus from "../components/SecurityStatus";
import VoiceCommandButton from "../components/VoiceCommandButton";
import VoiceFeedback from "../components/VoiceFeedback";
import { useAuth } from "../context/AuthContext";
import useDevices from "../hooks/useDevices";
import useVoiceCommand from "../hooks/useVoiceCommand";

export default function HomeScreen() {
  const {
    devices,
    connection,
    isSending,
    pendingCommand,
    isRefreshing,
    lastResult,
    sendCommand,
    onRefresh,
    isMockMode,
  } = useDevices();
  const { user, canControl, signOut } = useAuth();

  // Voice and buttons share ONE command flow: a recognized phrase becomes a
  // COMMAND_TYPES value and goes through sendCommand, exactly like a button press.
  const voice = useVoiceCommand({ onCommand: sendCommand });

  // Viewers can see device status but cannot send commands (the backend enforces this too).
  const controlsDisabled = isSending || !canControl;

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        // max-w keeps the dashboard readable on tablets
        contentContainerClassName="w-full max-w-xl self-center px-4 pb-10"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          // tintColor / colors / progressBackgroundColor are native props, not styles
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor="#22d3ee"
            colors={["#22d3ee"]}
            progressBackgroundColor="#0f172a"
          />
        }
      >
        <Header />

        <OfflineBanner visible={connection === "disconnected"} />

        <SectionCard>
          <VoiceCommandButton
            isListening={voice.isListening}
            onPress={voice.toggleListening}
            disabled={controlsDisabled}
            listeningLabel="Type your command below"
          />
          {voice.isListening ? (
            <MockVoiceInput
              onSubmit={voice.submitTranscript}
              onCancel={voice.stopListening}
              disabled={controlsDisabled}
            />
          ) : null}
          <VoiceFeedback feedback={voice.feedback} />
        </SectionCard>

        <SectionCard title="Device Control">
          {canControl ? null : (
            <Text className="mb-3 text-sm text-amber-400">
              View only: your account cannot control devices.
            </Text>
          )}
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onCommand={sendCommand}
              disabled={controlsDisabled}
              pendingCommand={pendingCommand}
            />
          ))}
        </SectionCard>

        <SectionCard title="System">
          <ConnectionStatus status={connection} mock={isMockMode} />
          <SecurityStatus />
        </SectionCard>

        <SectionCard title="Account">
          <AccountStatus
            user={user}
            canControl={canControl}
            isMockMode={isMockMode}
            onSignOut={() => signOut()}
          />
        </SectionCard>

        <SectionCard title="Last Result">
          <CommandResult result={lastResult} mock={isMockMode} />
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}