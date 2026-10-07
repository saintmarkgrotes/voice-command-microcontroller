import { useCallback, useState } from "react";

import { parseVoiceCommand } from "../services/voice/commandParser";
import { getVoiceMessage } from "../utils/voiceMessages";

const MAX_DISPLAY_LENGTH = 120;

// Voice flow: transcript -> parser -> command -> onCommand (the normal command flow).
//
// This hook does not care WHERE the transcript comes from. The mock input calls
// submitTranscript(text) today; a real speech-recognition engine will call the
// same function with its recognized text, so nothing else has to change.
//
// `parser` can be replaced by any function that follows the parser contract
// in commandParser.js.
export default function useVoiceCommand({
  onCommand,
  parser = parseVoiceCommand,
}) {
  const [isListening, setIsListening] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const stopListening = useCallback(() => setIsListening(false), []);

  const toggleListening = useCallback(() => {
    setIsListening((current) => !current);
  }, []);

  const submitTranscript = useCallback(
    (transcript) => {
      const shown =
        typeof transcript === "string"
          ? transcript.trim().slice(0, MAX_DISPLAY_LENGTH)
          : "";
      const result = parser(transcript);
      setIsListening(false);

      if (result.ok) {
        setFeedback({ ok: true, transcript: shown, command: result.command });
        onCommand(result.command);
      } else {
        setFeedback({
          ok: false,
          transcript: shown,
          code: result.code,
          message: getVoiceMessage(result.code),
        });
      }
      return result;
    },
    [onCommand, parser],
  );

  return {
    isListening,
    feedback,
    toggleListening,
    stopListening,
    submitTranscript,
  };
}