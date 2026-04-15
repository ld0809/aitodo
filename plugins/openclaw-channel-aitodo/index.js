import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { aitodoPlugin } from "./src/plugin.js";
import { runtimeStore } from "./src/runtime-store.js";

export default defineChannelPluginEntry({
  id: "aitodo",
  name: "AITodo",
  description: "AITodo channel plugin for OpenClaw",
  plugin: aitodoPlugin,
  setRuntime(runtime) {
    runtimeStore.setRuntime(runtime);
  },
});

export { runtimeStore };
