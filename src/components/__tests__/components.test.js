import { fireEvent, render, screen } from "@testing-library/react-native";

import AccountStatus from "../AccountStatus";
import CommandResult from "../CommandResult";
import ControlButton from "../ControlButton";
import DeviceCard from "../DeviceCard";
import OfflineBanner from "../OfflineBanner";
import VoiceFeedback from "../VoiceFeedback";

const lightDevice = (state = "off") => ({
  id: "light",
  name: "Light",
  icon: "💡",
  state: state.toUpperCase(),
  tone: state === "on" ? "positive" : "inactive",
  actions: [
    { label: "ON", command: "LIGHT_ON", selected: state === "on" },
    { label: "OFF", command: "LIGHT_OFF", selected: state === "off" },
  ],
});

describe("ControlButton", () => {
  test("calls onPress", async () => {
    const onPress = jest.fn();
    await render(<ControlButton label="ON" onPress={onPress} accessibilityLabel="Light ON" />);
    await fireEvent.press(screen.getByRole("button", { name: "Light ON" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("disabled: cannot be pressed", async () => {
    const onPress = jest.fn();
    await render(<ControlButton label="ON" onPress={onPress} disabled accessibilityLabel="Light ON" />);
    const button = screen.getByRole("button", { name: "Light ON" });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toBeDisabled();
  });

  test("loading: shows a spinner instead of the label, is busy and cannot be pressed", async () => {
    const onPress = jest.fn();
    await render(<ControlButton label="ON" onPress={onPress} loading accessibilityLabel="Light ON" />);
    const button = screen.getByRole("button", { name: "Light ON" });
    expect(screen.queryByText("ON")).toBeNull();
    expect(button).toBeBusy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("DeviceCard", () => {
  test("reports the pressed COMMAND_TYPES value, never builds commands itself", async () => {
    const onCommand = jest.fn();
    await render(<DeviceCard device={lightDevice()} onCommand={onCommand} />);

    await fireEvent.press(screen.getByRole("button", { name: "Light ON" }));
    await fireEvent.press(screen.getByRole("button", { name: "Light OFF" }));

    expect(onCommand.mock.calls).toEqual([["LIGHT_ON"], ["LIGHT_OFF"]]);
  });

  test("the pending command's button shows the spinner, the other is only unavailable", async () => {
    await render(
      <DeviceCard device={lightDevice()} onCommand={jest.fn()} disabled pendingCommand="LIGHT_ON" />,
    );
    expect(screen.getByRole("button", { name: "Light ON" })).toBeBusy();
    expect(screen.getByRole("button", { name: "Light OFF" })).not.toBeBusy();
    expect(screen.getByRole("button", { name: "Light OFF" })).toBeDisabled();
  });

  test("a disabled card (viewer) sends nothing", async () => {
    const onCommand = jest.fn();
    await render(<DeviceCard device={lightDevice()} onCommand={onCommand} disabled />);
    await fireEvent.press(screen.getByRole("button", { name: "Light ON" }));
    expect(onCommand).not.toHaveBeenCalled();
  });
});

describe("AccountStatus", () => {
  const admin = { username: "alice", role: "admin" };
  const viewer = { username: "bob", role: "viewer" };

  test("admin: name, full control and a working sign-out button", async () => {
    const onSignOut = jest.fn();
    await render(<AccountStatus user={admin} canControl onSignOut={onSignOut} />);
    expect(screen.getByText("alice")).toBeTruthy();
    expect(screen.getByText("Full control")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  test("viewer: shown as view only", async () => {
    await render(<AccountStatus user={viewer} canControl={false} onSignOut={jest.fn()} />);
    expect(screen.getByText("View only")).toBeTruthy();
  });

  test("mock mode: no sign-out button", async () => {
    await render(<AccountStatus user={admin} canControl isMockMode onSignOut={jest.fn()} />);
    expect(screen.getByText("Mock mode (no sign-in)")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  test("nobody signed in: renders nothing", async () => {
    await render(<AccountStatus user={null} />);
    expect(screen.queryByText("Account")).toBeNull();
  });
});

describe("OfflineBanner", () => {
  test("visible only when asked", async () => {
    await render(<OfflineBanner visible />);
    expect(screen.getByRole("alert")).toBeTruthy(); // screen readers announce it
    expect(screen.getByText(/showing the last known device states/)).toBeTruthy();
    expect(screen.getByText("Pull down to try again.")).toBeTruthy();
  });

  test("hidden by default", async () => {
    await render(<OfflineBanner />);
    expect(screen.queryByText(/Offline/)).toBeNull();
  });
});

describe("VoiceFeedback", () => {
  test("nothing before the first phrase", async () => {
    await render(<VoiceFeedback feedback={null} />);
    expect(screen.queryByText("Heard")).toBeNull();
  });

  test("understood phrase", async () => {
    await render(<VoiceFeedback feedback={{ ok: true, transcript: "turn on the light", command: "LIGHT_ON" }} />);
    expect(screen.getByText(/turn on the light/)).toBeTruthy();
    expect(screen.getByText("✓ Understood: LIGHT_ON")).toBeTruthy();
  });

  test("refused phrase shows the reason", async () => {
    await render(
      <VoiceFeedback feedback={{ ok: false, transcript: "don't open the door", message: "⚠️ Understood as a cancel. Nothing was sent." }} />,
    );
    expect(screen.getByText("⚠️ Understood as a cancel. Nothing was sent.")).toBeTruthy();
  });
});

describe("CommandResult", () => {
  const success = {
    ok: true,
    command: { device: "light", command: "LIGHT_ON" },
    commandId: "id-1",
    encryptedPayload: {
      algorithm: "AES-256-GCM",
      nonce: "n".repeat(40),
      ciphertext: "c".repeat(40),
      tag: "t".repeat(40),
    },
  };

  test("nothing sent yet", async () => {
    await render(<CommandResult result={null} />);
    expect(screen.getByText("No command sent yet.")).toBeTruthy();
  });

  test("success confirms and shortens the payload", async () => {
    await render(<CommandResult result={success} />);
    expect(screen.getByText("✓ Command secured")).toBeTruthy();
    expect(screen.getByText("✓ Backend processed command")).toBeTruthy();
    expect(screen.getByText("LIGHT_ON")).toBeTruthy();
    expect(screen.getByText("AES-256-GCM")).toBeTruthy();
    expect(screen.queryByText("n".repeat(40))).toBeNull(); // long values are truncated
    expect(screen.queryByText(/Mock mode/)).toBeNull();
  });

  test("mock mode says the payload is simulated", async () => {
    await render(<CommandResult result={success} mock />);
    expect(screen.getByText(/Mock mode: the payload is simulated/)).toBeTruthy();
  });

  test("an error shows only the friendly message", async () => {
    await render(<CommandResult result={{ ok: false, code: "FORBIDDEN", message: "⚠️ You do not have permission to do that." }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("⚠️ You do not have permission to do that.")).toBeTruthy();
  });
});