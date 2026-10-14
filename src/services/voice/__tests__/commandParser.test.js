import { COMMAND_TYPES } from "../../../constants/commandTypes";
import { parseVoiceCommand, VOICE_ERROR_CODES } from "../commandParser";

const ok = (command) => ({
  ok: true,
  command,
  device: command.split("_")[0].toLowerCase(),
});
const fail = (code) => ({ ok: false, code });

describe("voice parser: the 8 supported commands", () => {
  test.each([
    // the phrases listed in the project spec
    ["turn on the light", "LIGHT_ON"],
    ["switch on the light", "LIGHT_ON"],
    ["lights on", "LIGHT_ON"],
    ["turn off the light", "LIGHT_OFF"],
    ["turn on the fan", "FAN_ON"],
    ["open the door", "DOOR_OPEN"],
    // every command has at least one phrase
    ["turn off the fan", "FAN_OFF"],
    ["close the door", "DOOR_CLOSE"],
    ["turn on the water pump", "PUMP_ON"],
    ["turn off the water pump", "PUMP_OFF"],
    // natural variations
    ["Turn ON the Light!", "LIGHT_ON"],
    ["  turn the light off  ", "LIGHT_OFF"],
    ["could you please close the door", "DOOR_CLOSE"],
    ["switch off the lamp", "LIGHT_OFF"],
    ["stop the fan", "FAN_OFF"],
    ["start the pump", "PUMP_ON"],
    ["shut the door", "DOOR_CLOSE"],
    ["shut off the fan", "FAN_OFF"],
    ["shut down the fan", "FAN_OFF"],
    ["turn on the light in the kitchen", "LIGHT_ON"],
  ])('"%s" -> %s', (phrase, command) => {
    expect(parseVoiceCommand(phrase)).toEqual(ok(command));
  });

  test("all 8 commands can be reached by voice", () => {
    const reached = new Set(
      [
        "light on",
        "light off",
        "fan on",
        "fan off",
        "open door",
        "close door",
        "pump on",
        "pump off",
      ].map((phrase) => parseVoiceCommand(phrase).command),
    );
    expect([...reached].sort()).toEqual(Object.values(COMMAND_TYPES).sort());
  });
});

describe("voice parser: refuses instead of guessing (nothing is sent)", () => {
  test.each([
    ["", VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    ["   ", VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    ["!!!", VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    [null, VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    [undefined, VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    [42, VOICE_ERROR_CODES.EMPTY_TRANSCRIPT],
    ["x".repeat(101), VOICE_ERROR_CODES.TOO_LONG],
    ["hello there", VOICE_ERROR_CODES.NOT_A_COMMAND],
    ["what time is it", VOICE_ERROR_CODES.NOT_A_COMMAND],
    // questions are not commands
    ["is the light on", VOICE_ERROR_CODES.NOT_A_COMMAND],
    ["is the door open", VOICE_ERROR_CODES.NOT_A_COMMAND],
    ["are the lights off", VOICE_ERROR_CODES.NOT_A_COMMAND],
    // conditionals are not commands
    ["open the door when I say", VOICE_ERROR_CODES.NOT_A_COMMAND],
    ["turn on the light if it is dark", VOICE_ERROR_CODES.NOT_A_COMMAND],
    // negations must NEVER trigger the action
    ["don't open the door", VOICE_ERROR_CODES.NEGATED],
    ["don’t open the door", VOICE_ERROR_CODES.NEGATED], // curly apostrophe
    ["do not turn on the light", VOICE_ERROR_CODES.NEGATED],
    ["never open the door", VOICE_ERROR_CODES.NEGATED],
    ["cancel", VOICE_ERROR_CODES.NEGATED],
    ["no, don't turn on the pump", VOICE_ERROR_CODES.NEGATED],
    // incomplete
    ["turn on", VOICE_ERROR_CODES.NO_DEVICE],
    ["open it", VOICE_ERROR_CODES.NO_DEVICE],
    ["the light", VOICE_ERROR_CODES.NO_ACTION],
    ["fan", VOICE_ERROR_CODES.NO_ACTION],
    // more than one thing at once
    ["turn on the light and the fan", VOICE_ERROR_CODES.AMBIGUOUS_DEVICE],
    ["turn on the light and open the door", VOICE_ERROR_CODES.AMBIGUOUS_DEVICE],
    ["turn on and off the light", VOICE_ERROR_CODES.AMBIGUOUS_ACTION],
    ["open and close the door", VOICE_ERROR_CODES.AMBIGUOUS_ACTION],
    // actions a device does not have
    ["turn on the door", VOICE_ERROR_CODES.UNSUPPORTED_ACTION],
    ["open the light", VOICE_ERROR_CODES.UNSUPPORTED_ACTION],
    ["close the fan", VOICE_ERROR_CODES.UNSUPPORTED_ACTION],
    ["shut the pump", VOICE_ERROR_CODES.UNSUPPORTED_ACTION],
  ])("%j -> %s", (phrase, code) => {
    expect(parseVoiceCommand(phrase)).toEqual(fail(code));
  });

  test("only whole words match", () => {
    // "fan" inside "fantastic", "light" inside "lighthouse", "door" inside "doorbell"
    expect(parseVoiceCommand("fantastic").ok).toBe(false);
    expect(parseVoiceCommand("turn on the lighthouse").ok).toBe(false);
    expect(parseVoiceCommand("the doorbell is on").ok).toBe(false);
  });

  test("a parsed command is always a real COMMAND_TYPES value", () => {
    const real = new Set(Object.values(COMMAND_TYPES));
    ["light on", "open door", "pump off", "fan on"].forEach((phrase) => {
      const result = parseVoiceCommand(phrase);
      expect(real.has(result.command)).toBe(true);
    });
  });
});