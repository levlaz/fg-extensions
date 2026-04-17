import { ExtensionContext } from "@foxglove/extension";

import { initFormPublishPanel } from "./FormPublishPanel";

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({ name: "form-publish-panel", initPanel: initFormPublishPanel });
}
