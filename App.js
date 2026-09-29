import "./global.css";

import AppProviders from "./app/AppProviders";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  return (
    <AppProviders>
      <AppNavigator />
    </AppProviders>
  );
}
