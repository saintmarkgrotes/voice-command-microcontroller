import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import HomeScreen from "../screens/HomeScreen";
import LoginScreen from "../screens/LoginScreen";
import SessionLoadingScreen from "../screens/SessionLoadingScreen";

const Stack = createNativeStackNavigator();

// React Navigation takes its theme as a plain JS object, so this is one of the
// few places colors are not NativeWind classes. It only affects the navigator
// background so there is no white flash between screens.
const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#020617", // slate-950
    card: "#020617",
  },
};

// Which screens exist depends on the sign-in state, so signed-out users cannot
// reach the dashboard, and signing out (or an expired session) returns to Login.
export default function AppNavigator() {
  const { status } = useAuth();

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {status === "loading" ? (
          <Stack.Screen name="Loading" component={SessionLoadingScreen} />
        ) : status === "signedIn" ? (
          <Stack.Screen name="Home" component={HomeScreen} />
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ animationTypeForReplace: "pop" }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}