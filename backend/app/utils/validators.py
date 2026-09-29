from app.constants import COMMAND_DEFINITIONS, DEVICES
from app.errors import BadRequestError


def _normalize(value, transform):
    """Trim, then change case. Non-ASCII text is left untouched so it fails
    validation (avoids Unicode case-mapping surprises like 'ı' -> 'I')."""
    value = value.strip()
    return transform(value) if value.isascii() else value


def validate_command_request(data):
    """Validate and normalize a POST /api/commands body. Returns (device, command).

    Raises BadRequestError with the contract's error codes. Extra fields
    are ignored and never used (in particular, client timestamps).
    """
    if not isinstance(data, dict):
        raise BadRequestError("Request body must be a JSON object.")

    raw_device = data.get("device")
    raw_command = data.get("command")

    if not isinstance(raw_device, str) or not isinstance(raw_command, str):
        raise BadRequestError('Fields "device" and "command" are required strings.')

    device = _normalize(raw_device, str.lower)
    command = _normalize(raw_command, str.upper)

    if device not in DEVICES:
        raise BadRequestError("Unsupported device.", code="INVALID_DEVICE")

    if command not in COMMAND_DEFINITIONS:
        raise BadRequestError("Unsupported command.", code="INVALID_COMMAND")

    if COMMAND_DEFINITIONS[command]["device"] != device:
        raise BadRequestError(
            "Command is not valid for this device.",
            code="COMMAND_DEVICE_MISMATCH",
        )

    return device, command