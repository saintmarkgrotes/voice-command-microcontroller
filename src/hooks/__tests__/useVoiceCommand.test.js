import { act, renderHook } from "@testing-library/react-native";

import useVoiceCommand from "../useVoiceCommand";

const setup = (options = {}) => {
  const onCommand = jest.fn();
  return { onCommand, hookPromise: renderHook(() => useVoiceCommand({ onCommand, ...options })) };
};

describe("useVoiceCommand", () => {
  test("a recognized phrase becomes a command and is sent", async () => {
    const { onCommand, hookPromise } = setup();
    const { result } = await hookPromise;

    await act(() => {
      result.current.submitTranscript("  Turn ON the light  ");
    });

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand).toHaveBeenCalledWith("LIGHT_ON");
    expect(result.current.feedback).toEqual({
      ok: true,
      transcript: "Turn ON the light",
      command: "LIGHT_ON",
    });
  });

  test.each([
    ["don't open the door", "NEGATED"],
    ["is the light on", "NOT_A_COMMAND"],
    ["turn on the light and the fan", "AMBIGUOUS_DEVICE"],
    ["open the light", "UNSUPPORTED_ACTION"],
    ["", "EMPTY_TRANSCRIPT"],
  ])("%j sends NOTHING and explains why", async (phrase, code) => {
    const { onCommand, hookPromise } = setup();
    const { result } = await hookPromise;

    await act(() => {
      result.current.submitTranscript(phrase);
    });

    expect(onCommand).not.toHaveBeenCalled();
    expect(result.current.feedback).toMatchObject({ ok: false, code });
    expect(result.current.feedback.message.startsWith("⚠️")).toBe(true);
  });

  test("listening toggles on and off, and a transcript stops it", async () => {
    const { hookPromise } = setup();
    const { result } = await hookPromise;
    expect(result.current.isListening).toBe(false);

    await act(() => result.current.toggleListening());
    expect(result.current.isListening).toBe(true);
    await act(() => result.current.toggleListening());
    expect(result.current.isListening).toBe(false);

    await act(() => result.current.toggleListening());
    await act(() => {
      result.current.submitTranscript("fan on");
    });
    expect(result.current.isListening).toBe(false);

    await act(() => result.current.toggleListening());
    await act(() => result.current.stopListening());
    expect(result.current.isListening).toBe(false);
  });

  test("a different parser can be plugged in (the NLP/AI replacement seam)", async () => {
    const parser = jest.fn(() => ({ ok: true, command: "PUMP_ON", device: "pump" }));
    const { onCommand, hookPromise } = setup({ parser });
    const { result } = await hookPromise;

    await act(() => {
      result.current.submitTranscript("water the garden");
    });

    expect(parser).toHaveBeenCalledWith("water the garden");
    expect(onCommand).toHaveBeenCalledWith("PUMP_ON");
  });

  test("very long transcripts are shortened for display only", async () => {
    const { hookPromise } = setup();
    const { result } = await hookPromise;
    await act(() => {
      result.current.submitTranscript("x".repeat(500));
    });
    expect(result.current.feedback.transcript.length).toBe(120);
    expect(result.current.feedback.code).toBe("TOO_LONG");
  });
});