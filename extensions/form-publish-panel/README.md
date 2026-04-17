# form-publish-panel

A Foxglove panel that publishes JSON messages to your robotics stack by rendering a form — no raw message editing required.

Inspired by Foxglove [event types](https://docs.foxglove.dev/docs/data/events#event-types): you define a named message type with an ordered list of typed properties, and the panel renders a form based on that definition. When a user fills the form and hits **Submit**, the values are assembled into a JSON object and published on the configured topic.

## Configure

Open the panel's settings and configure:

- **Topic** — the topic to publish on (e.g. `/my_topic`)
- **Schema name** — the message schema name the datasource expects (e.g. `std_msgs/String`, or a custom JSON schema name)
- **Message type name** — a human-readable label shown at the top of the form
- **Color** — accent color for the form header
- **Fields** — the ordered list of typed properties. Each field has:
  - **Key** — the JSON key used in the published message
  - **Label** — the human-readable label shown in the form
  - **Type** — one of: `text`, `multiline`, `number`, `boolean`, `select`, `multiselect`
  - **Options** — comma-separated values (used for `select` and `multiselect`)
  - **Default** — optional default value

## Publish

Once configured, fill out the form in the panel and click **Submit**. The panel calls `context.advertise(topic, schemaName)` then `context.publish(topic, payload)` where `payload` is the collected form values keyed by field `key`.

## Develop

```sh
npm install
npm run local-install
```

Then open Foxglove (or `Ctrl-R` to refresh) to see the panel in the panel list.
