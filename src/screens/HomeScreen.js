import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import CommandResult from "../components/CommandResult";
import ConnectionStatus from "../components/ConnectionStatus";
import DeviceCard from "../components/DeviceCard";
import Header from "../components/Header";
import SectionCard from "../components/SectionCard";
import SecurityStatus from "../components/SecurityStatus";
import VoiceCommandButton from "../components/VoiceCommandButton";
import useDevices from "../hooks/useDevices";

export default function HomeScreen() {
  const {
    devices,
    connection,
    isSending,
    lastResult,
    sendCommand,
    isMockMode,
  } = useDevices();
  const [isListening, setIsListening] = useState(false);

  // Mock voice input: "listens" for 2.5 seconds, then stops.
  // Real speech recognition arrives in Phase 12.
  useEffect(() => {
    if (!isListening) return undefined;
    const timer = setTimeout(() => setIsListening(false), 2500);
    return () => clearTimeout(timer);
  }, [isListening]);

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <ScrollView
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        <Header />

        <SectionCard>
          <VoiceCommandButton
            isListening={isListening}
            onPress={() => setIsListening((current) => !current)}
          />
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
