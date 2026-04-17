# form-publish-panel version history

## 0.0.0

- Initial release: form-driven JSON publish panel with typed properties (text, multiline, number, boolean, single-select, multi-select, JSON).
- JSON field type: paste a raw JSON string (object, array, number, etc.); it is parsed and published as nested JSON, not as a string. Invalid JSON blocks submission with an inline error.
- Debug mode toggle in panel settings — when enabled, shows the raw JSON payload of the most recently published message in the panel body.
