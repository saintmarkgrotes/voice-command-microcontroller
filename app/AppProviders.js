import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../src/context/AuthContext";

export default function AppProviders({ children }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>{children}</AuthProvider>
    </SafeAreaProvider>
  );
}