import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import config from "../../app/config";
import Header from "../components/Header";
import SectionCard from "../components/SectionCard";
import { useAuth } from "../context/AuthContext";
import { getUserMessage } from "../utils/errorMessages";

// Same limits as the backend (validators.py).
const MAX_USERNAME_LENGTH = 64;
const MAX_PASSWORD_LENGTH = 128;

const LOCKED_OUT_MESSAGE =
  "⚠️ Too many failed attempts. Please wait a few minutes and try again.";

// The mobile app talks plain HTTP on a local network during development.
const isInsecureConnection = config.apiBaseUrl.startsWith("http://");

export default function LoginScreen() {
  const { signIn, notice } = useAuth();
  const passwordInput = useRef(null);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await signIn(username.trim(), password);
      // Success: the navigator swaps this screen for the dashboard.
    } catch (error) {
      setErrorMessage(
        error.code === "RATE_LIMITED"
          ? LOCKED_OUT_MESSAGE
          : getUserMessage(error),
      );
      setPassword(""); // never keep a rejected password in memory
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-950">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-4 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header title="Smart Home" subtitle="Sign in" />

          <SectionCard>
            <Text className="text-sm text-slate-400">Username</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              editable={!isSubmitting}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              returnKeyType="next"
              maxLength={MAX_USERNAME_LENGTH}
              onSubmitEditing={() => passwordInput.current?.focus()}
              accessibilityLabel="Username"
              className="mb-4 mt-1 rounded-lg bg-slate-800 px-3 py-3 text-base text-white"
            />

            <Text className="text-sm text-slate-400">Password</Text>
            <View className="mt-1 flex-row items-center rounded-lg bg-slate-800">
              <TextInput
                ref={passwordInput}
                value={password}
                onChangeText={setPassword}
                editable={!isSubmitting}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                maxLength={MAX_PASSWORD_LENGTH}
                onSubmitEditing={submit}
                accessibilityLabel="Password"
                className="flex-1 px-3 py-3 text-base text-white"
              />
              <Pressable
                onPress={() => setShowPassword((current) => !current)}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                className="px-3 py-3 active:opacity-70"
              >
                <Text className="text-sm font-semibold text-cyan-400">
                  {showPassword ? "Hide" : "Show"}
                </Text>
              </Pressable>
            </View>

            {errorMessage ? (
              <Text
                accessibilityLiveRegion="polite"
                className="mt-4 text-sm font-semibold text-rose-400"
              >
                {errorMessage}
              </Text>
            ) : notice ? (
              <Text
                accessibilityLiveRegion="polite"
                className="mt-4 text-sm font-semibold text-amber-400"
              >
                {notice}
              </Text>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
              className={`mt-5 flex-row items-center justify-center rounded-lg bg-cyan-500 py-3 active:opacity-70 ${
                canSubmit ? "" : "opacity-50"
              }`}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#020617" /> // native prop; NativeWind cannot set it
              ) : (
                <Text className="text-base font-bold text-slate-950">
                  SIGN IN
                </Text>
              )}
            </Pressable>
          </SectionCard>

          {isInsecureConnection ? (
            <Text className="mt-4 text-center text-xs text-amber-400">
              ⚠️ This connection is not encrypted (HTTP). Only sign in on a
              network you trust.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}