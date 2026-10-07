import { View, Text, Pressable } from "react-native";

// Who is signed in, what they may do, and the sign-out button.
// `user` is { username, role } or null.
export default function AccountStatus({
  user,
  canControl = false,
  isMockMode = false,
  onSignOut,
}) {
  if (!user) return null;

  return (
    <View>
      <View className="flex-row items-center justify-between py-1.5">
        <Text className="text-sm text-slate-400">Account</Text>
        <Text className="text-sm font-semibold text-slate-200">
          {isMockMode ? "Mock mode (no sign-in)" : user.username}
        </Text>
      </View>

      <View className="flex-row items-center justify-between py-1.5">
        <Text className="text-sm text-slate-400">Access</Text>
        <Text
          className={`text-sm font-semibold ${
            canControl ? "text-emerald-400" : "text-amber-400"
          }`}
        >
          {canControl ? "Full control" : "View only"}
        </Text>
      </View>

      {isMockMode ? null : (
        <Pressable
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="mt-2 items-center rounded-lg bg-slate-700 py-3 active:opacity-70"
        >
          <Text className="text-sm font-bold tracking-wide text-slate-200">
            SIGN OUT
          </Text>
        </Pressable>
      )}
    </View>
  );
}