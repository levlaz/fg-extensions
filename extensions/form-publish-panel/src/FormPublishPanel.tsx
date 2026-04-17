import {
  Immutable,
  PanelExtensionContext,
  SettingsTreeAction,
  SettingsTreeFields,
  SettingsTreeNode,
  SettingsTreeNodes,
  Topic,
} from "@foxglove/extension";
import {
  ChangeEvent,
  CSSProperties,
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

type FieldType =
  | "text"
  | "multiline"
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "json";

type FieldDef = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  defaultValue: unknown;
};

type PanelConfig = {
  topic: string;
  schemaName: string;
  messageTypeName: string;
  color: string;
  debug: boolean;
  fields: FieldDef[];
};

const DEFAULT_CONFIG: PanelConfig = {
  topic: "",
  schemaName: "",
  messageTypeName: "Untitled message",
  color: "#4287f5",
  debug: false,
  fields: [],
};

const FIELD_TYPE_OPTIONS: Array<{ label: string; value: FieldType }> = [
  { label: "Single-line text", value: "text" },
  { label: "Multi-line text", value: "multiline" },
  { label: "Number", value: "number" },
  { label: "True/False", value: "boolean" },
  { label: "Single-select", value: "select" },
  { label: "Multi-select", value: "multiselect" },
  { label: "JSON", value: "json" },
];

function newFieldId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function makeDefaultField(): FieldDef {
  return {
    id: newFieldId(),
    key: "",
    label: "New field",
    type: "text",
    options: [],
    defaultValue: undefined,
  };
}

function coerceConfig(raw: unknown): PanelConfig {
  const r = (typeof raw === "object" && raw != undefined ? raw : {}) as Record<string, unknown>;
  const rawFields = Array.isArray(r.fields) ? (r.fields as unknown[]) : [];
  const fields: FieldDef[] = rawFields.map((rawF) => {
    const f = (typeof rawF === "object" && rawF != undefined ? rawF : {}) as Record<string, unknown>;
    return {
      id: typeof f.id === "string" && f.id.length > 0 ? f.id : newFieldId(),
      key: typeof f.key === "string" ? f.key : "",
      label: typeof f.label === "string" ? f.label : "Field",
      type: isFieldType(f.type) ? f.type : "text",
      options: Array.isArray(f.options)
        ? (f.options as unknown[]).filter((o): o is string => typeof o === "string")
        : [],
      defaultValue: f.defaultValue,
    };
  });
  return {
    topic: typeof r.topic === "string" ? r.topic : "",
    schemaName: typeof r.schemaName === "string" ? r.schemaName : "",
    messageTypeName:
      typeof r.messageTypeName === "string" && r.messageTypeName.length > 0
        ? r.messageTypeName
        : DEFAULT_CONFIG.messageTypeName,
    color: typeof r.color === "string" ? r.color : DEFAULT_CONFIG.color,
    debug: typeof r.debug === "boolean" ? r.debug : DEFAULT_CONFIG.debug,
    fields,
  };
}

function isFieldType(v: unknown): v is FieldType {
  return (
    v === "text" ||
    v === "multiline" ||
    v === "number" ||
    v === "boolean" ||
    v === "select" ||
    v === "multiselect" ||
    v === "json"
  );
}

function initialValueForField(field: FieldDef): unknown {
  if (field.defaultValue != undefined && field.defaultValue !== "") {
    return field.defaultValue;
  }
  switch (field.type) {
    case "boolean":
      return false;
    case "multiselect":
      return [];
    case "number":
      return undefined;
    case "text":
    case "multiline":
    case "select":
    case "json":
      return "";
  }
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

function parseJsonFieldValue(raw: unknown): JsonParseResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function FormPublishPanel({ context }: { context: PanelExtensionContext }): ReactElement {
  const [config, setConfig] = useState<PanelConfig>(() => coerceConfig(context.initialState));
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const f of coerceConfig(context.initialState).fields) {
      initial[f.id] = initialValueForField(f);
    }
    return initial;
  });
  const [topics, setTopics] = useState<undefined | Immutable<Topic[]>>();
  const [status, setStatus] = useState<{ kind: "idle" | "success" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });
  const [lastPublished, setLastPublished] = useState<
    | {
        topic: string;
        schemaName: string;
        payload: Record<string, unknown>;
        timestamp: Date;
      }
    | undefined
  >();
  const [renderDone, setRenderDone] = useState<(() => void) | undefined>();

  // Keep values in sync with config.fields — when a field is added, seed its default;
  // when removed, drop its value. We intentionally don't overwrite existing values
  // the user has already typed on fields that still exist.
  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, unknown> = {};
      for (const f of config.fields) {
        next[f.id] = Object.prototype.hasOwnProperty.call(prev, f.id)
          ? prev[f.id]
          : initialValueForField(f);
      }
      return next;
    });
  }, [config.fields]);

  const settingsActionHandler = useCallback(
    (action: SettingsTreeAction) => {
      setConfig((prev) => applySettingsAction(prev, action));
    },
    [],
  );

  // Push config into Foxglove's save/restore and settings editor whenever it changes.
  useEffect(() => {
    context.saveState(config);
    context.updatePanelSettingsEditor({
      actionHandler: settingsActionHandler,
      nodes: buildSettingsNodes(config, topics),
    });
  }, [config, context, settingsActionHandler, topics]);

  useLayoutEffect(() => {
    context.onRender = (renderState, done) => {
      setRenderDone(() => done);
      setTopics(renderState.topics);
    };
    context.watch("topics");
  }, [context]);

  useEffect(() => {
    renderDone?.();
  }, [renderDone]);

  const handleSubmit = useCallback(() => {
    if (!config.topic) {
      setStatus({ kind: "error", message: "Topic is required" });
      return;
    }
    if (!config.schemaName) {
      setStatus({ kind: "error", message: "Schema name is required" });
      return;
    }
    if (!context.advertise || !context.publish) {
      setStatus({
        kind: "error",
        message: "Current data source does not support publishing",
      });
      return;
    }
    const payload: Record<string, unknown> = {};
    for (const field of config.fields) {
      if (!field.key) {
        continue;
      }
      if (field.type === "json") {
        const parsed = parseJsonFieldValue(values[field.id]);
        if (!parsed.ok) {
          setStatus({
            kind: "error",
            message: `Invalid JSON in field "${field.label || field.key}": ${parsed.error}`,
          });
          return;
        }
        payload[field.key] = parsed.value;
        continue;
      }
      payload[field.key] = values[field.id];
    }
    try {
      context.advertise(config.topic, config.schemaName);
      context.publish(config.topic, payload);
      const timestamp = new Date();
      setLastPublished({
        topic: config.topic,
        schemaName: config.schemaName,
        payload,
        timestamp,
      });
      setStatus({
        kind: "success",
        message: `Published to ${config.topic} at ${timestamp.toLocaleTimeString()}`,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [config, context, values]);

  const canPublish = context.advertise != undefined && context.publish != undefined;

  return (
    <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div
        style={{
          borderLeft: `4px solid ${config.color}`,
          paddingLeft: "0.75rem",
        }}
      >
        <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{config.messageTypeName}</div>
        <div style={{ fontSize: "0.8rem", opacity: 0.7 }}>
          {config.topic ? (
            <>
              Publishing to <code>{config.topic}</code>
              {config.schemaName ? (
                <>
                  {" "}
                  as <code>{config.schemaName}</code>
                </>
              ) : null}
            </>
          ) : (
            "Configure topic and schema in panel settings"
          )}
        </div>
      </div>

      {config.fields.length === 0 ? (
        <div style={{ fontSize: "0.9rem", opacity: 0.7 }}>
          No fields configured yet. Open panel settings and add fields to build the form.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {config.fields.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(v) => {
                setValues((prev) => ({ ...prev, [field.id]: v }));
              }}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canPublish || config.fields.length === 0}
          style={{
            background: config.color,
            color: "white",
            border: "none",
            padding: "0.5rem 1rem",
            borderRadius: "4px",
            cursor: canPublish && config.fields.length > 0 ? "pointer" : "not-allowed",
            opacity: canPublish && config.fields.length > 0 ? 1 : 0.5,
          }}
        >
          Submit
        </button>
        {!canPublish && (
          <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            Publishing unavailable for this data source
          </span>
        )}
      </div>

      {status.kind !== "idle" && (
        <div
          style={{
            fontSize: "0.85rem",
            color: status.kind === "error" ? "#d33" : "#2a8",
          }}
        >
          {status.message}
        </div>
      )}

      {config.debug && (
        <div
          style={{
            marginTop: "0.25rem",
            padding: "0.6rem 0.75rem",
            borderRadius: "4px",
            border: "1px dashed rgba(127,127,127,0.5)",
            fontSize: "0.8rem",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            background: "rgba(127,127,127,0.08)",
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: "0.35rem", opacity: 0.8 }}>
            Debug: last published message
          </div>
          {lastPublished ? (
            <>
              <div style={{ opacity: 0.75, marginBottom: "0.25rem" }}>
                {lastPublished.timestamp.toISOString()} → <code>{lastPublished.topic}</code>{" "}
                (<code>{lastPublished.schemaName}</code>)
              </div>
              <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {JSON.stringify(lastPublished.payload, null, 2)}
              </pre>
            </>
          ) : (
            <div style={{ opacity: 0.6 }}>
              Nothing published yet. Submit the form to see the raw JSON here.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}): ReactElement {
  const label = (
    <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>
      {field.label}
      {field.key ? <span style={{ opacity: 0.5 }}> ({field.key})</span> : null}
    </label>
  );

  let input: ReactElement;
  let hint: ReactElement | undefined;
  switch (field.type) {
    case "text":
      input = (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value);
          }}
          style={inputStyle}
        />
      );
      break;
    case "multiline":
      input = (
        <textarea
          value={typeof value === "string" ? value : ""}
          rows={3}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
          }}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      );
      break;
    case "number":
      input = (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === "" ? undefined : Number(e.target.value));
          }}
          style={inputStyle}
        />
      );
      break;
    case "boolean":
      input = (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.checked);
          }}
        />
      );
      break;
    case "select":
      input = (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            onChange(e.target.value);
          }}
          style={inputStyle}
        >
          <option value="">—</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case "multiselect": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      input = (
        <select
          multiple
          value={selected}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const next: string[] = [];
            for (const opt of Array.from(e.target.selectedOptions)) {
              next.push(opt.value);
            }
            onChange(next);
          }}
          style={{ ...inputStyle, minHeight: "4.5rem" }}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    }
    case "json": {
      const raw = typeof value === "string" ? value : "";
      const parsed = parseJsonFieldValue(raw);
      input = (
        <textarea
          value={raw}
          rows={4}
          spellCheck={false}
          placeholder='e.g. {"x": 1.0, "y": 2.0} or [1, 2, 3]'
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value);
          }}
          style={{
            ...inputStyle,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            resize: "vertical",
            borderColor: parsed.ok ? inputStyle.border?.toString() : "#d33",
          }}
        />
      );
      hint = parsed.ok ? (
        raw.trim().length > 0 ? (
          <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>
            Parsed as {describeJsonType(parsed.value)} — will be published as nested JSON, not a string.
          </span>
        ) : (
          <span style={{ fontSize: "0.75rem", opacity: 0.5 }}>
            Leave empty to publish <code>null</code>.
          </span>
        )
      ) : (
        <span style={{ fontSize: "0.75rem", color: "#d33" }}>Invalid JSON: {parsed.error}</span>
      );
      break;
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
      {label}
      {input}
      {hint}
    </div>
  );
}

function describeJsonType(value: unknown): string {
  if (value == undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `array (${value.length})`;
  }
  if (typeof value === "object") {
    return `object (${Object.keys(value as Record<string, unknown>).length} keys)`;
  }
  return typeof value;
}

const inputStyle: CSSProperties = {
  padding: "0.35rem 0.5rem",
  borderRadius: "3px",
  border: "1px solid rgba(127,127,127,0.4)",
  background: "transparent",
  color: "inherit",
  fontSize: "0.9rem",
  fontFamily: "inherit",
};

function applySettingsAction(config: PanelConfig, action: SettingsTreeAction): PanelConfig {
  if (action.action === "update") {
    const { path, value } = action.payload;
    if (path.length === 2 && path[0] === "general") {
      const key = path[1];
      if (key === "topic" && typeof value === "string") {
        return { ...config, topic: value };
      }
      if (key === "schemaName" && typeof value === "string") {
        return { ...config, schemaName: value };
      }
      if (key === "messageTypeName" && typeof value === "string") {
        return { ...config, messageTypeName: value };
      }
      if (key === "color" && typeof value === "string") {
        return { ...config, color: value };
      }
      if (key === "debug" && typeof value === "boolean") {
        return { ...config, debug: value };
      }
    }
    if (path.length === 3 && path[0] === "fields") {
      const [, fieldId, fieldKey] = path;
      return {
        ...config,
        fields: config.fields.map((f) => {
          if (f.id !== fieldId) {
            return f;
          }
          if (fieldKey === "label" && typeof value === "string") {
            return { ...f, label: value };
          }
          if (fieldKey === "key" && typeof value === "string") {
            return { ...f, key: value };
          }
          if (fieldKey === "type" && isFieldType(value)) {
            return { ...f, type: value, defaultValue: undefined };
          }
          if (fieldKey === "options" && typeof value === "string") {
            return {
              ...f,
              options: value
                .split(",")
                .map((o) => o.trim())
                .filter((o) => o.length > 0),
            };
          }
          if (fieldKey === "defaultValue") {
            return { ...f, defaultValue: value };
          }
          return f;
        }),
      };
    }
    return config;
  }
  // action.action === "perform-node-action"
  const { id, path } = action.payload;
  if (id === "add-field" && path.length === 1 && path[0] === "fields") {
    return { ...config, fields: [...config.fields, makeDefaultField()] };
  }
  if (id === "remove-field" && path.length === 2 && path[0] === "fields") {
    const fieldId = path[1]!;
    return { ...config, fields: config.fields.filter((f) => f.id !== fieldId) };
  }
  if (id === "move-up" && path.length === 2 && path[0] === "fields") {
    return moveField(config, path[1]!, -1);
  }
  if (id === "move-down" && path.length === 2 && path[0] === "fields") {
    return moveField(config, path[1]!, 1);
  }
  return config;
}

function moveField(config: PanelConfig, fieldId: string, delta: number): PanelConfig {
  const idx = config.fields.findIndex((f) => f.id === fieldId);
  if (idx < 0) {
    return config;
  }
  const target = idx + delta;
  if (target < 0 || target >= config.fields.length) {
    return config;
  }
  const next = [...config.fields];
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item!);
  return { ...config, fields: next };
}

function buildSettingsNodes(
  config: PanelConfig,
  topics: undefined | Immutable<Topic[]>,
): SettingsTreeNodes {
  const fieldChildren: Record<string, SettingsTreeNode> = {};
  for (const [idx, field] of config.fields.entries()) {
    fieldChildren[field.id] = {
      label: field.label || "(unnamed field)",
      renamable: true,
      actions: [
        { type: "action", id: "move-up", label: "Move up", display: "menu" },
        { type: "action", id: "move-down", label: "Move down", display: "menu" },
        { type: "action", id: "remove-field", label: "Remove", display: "menu" },
      ],
      order: idx,
      fields: {
        key: {
          label: "JSON key",
          input: "string",
          value: field.key,
          placeholder: "e.g. velocity",
        },
        label: {
          label: "Label",
          input: "string",
          value: field.label,
        },
        type: {
          label: "Type",
          input: "select",
          value: field.type,
          options: FIELD_TYPE_OPTIONS,
        },
        ...(field.type === "select" || field.type === "multiselect"
          ? {
              options: {
                label: "Options",
                input: "string" as const,
                value: field.options.join(", "),
                placeholder: "comma,separated,values",
              },
            }
          : {}),
        ...defaultValueField(field),
      },
    };
  }

  return {
    general: {
      label: "General",
      defaultExpansionState: "expanded",
      fields: {
        messageTypeName: {
          label: "Message type name",
          input: "string",
          value: config.messageTypeName,
        },
        color: {
          label: "Color",
          input: "rgb",
          value: config.color,
        },
        topic: {
          label: "Topic",
          input: "autocomplete",
          value: config.topic,
          items: (topics ?? []).map((t) => t.name),
          placeholder: "/my_topic",
        },
        schemaName: {
          label: "Schema name",
          input: "string",
          value: config.schemaName,
          placeholder: "e.g. std_msgs/String",
        },
        debug: {
          label: "Debug mode",
          input: "boolean",
          value: config.debug,
          help: "When enabled, show the raw JSON payload of the most recently published message in the panel.",
        },
      },
    },
    fields: {
      label: "Fields",
      defaultExpansionState: "expanded",
      actions: [
        { type: "action", id: "add-field", label: "Add field", display: "inline" },
      ],
      children: fieldChildren,
    },
  };
}

function defaultValueField(field: FieldDef): SettingsTreeFields {
  switch (field.type) {
    case "boolean":
      return {
        defaultValue: {
          label: "Default",
          input: "boolean",
          value: field.defaultValue === true,
        },
      };
    case "number":
      return {
        defaultValue: {
          label: "Default",
          input: "number",
          value: typeof field.defaultValue === "number" ? field.defaultValue : undefined,
        },
      };
    case "select":
      return {
        defaultValue: {
          label: "Default",
          input: "select",
          value: typeof field.defaultValue === "string" ? field.defaultValue : undefined,
          options: [
            { label: "—", value: undefined },
            ...field.options.map((o) => ({ label: o, value: o })),
          ],
        },
      };
    case "multiselect":
      return {};
    case "text":
    case "multiline":
      return {
        defaultValue: {
          label: "Default",
          input: "string",
          value: typeof field.defaultValue === "string" ? field.defaultValue : "",
        },
      };
    case "json":
      return {
        defaultValue: {
          label: "Default (raw JSON)",
          input: "multiline-string",
          value: typeof field.defaultValue === "string" ? field.defaultValue : "",
          placeholder: '{"example": 1}',
        },
      };
  }
}

export function initFormPublishPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(<FormPublishPanel context={context} />);
  return () => {
    root.unmount();
  };
}
