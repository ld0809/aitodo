export function extractResultText(runResult) {
  const payloadTexts = Array.isArray(runResult?.payloads)
    ? runResult.payloads
        .filter((payload) => payload && payload.isError !== true)
        .map((payload) => (typeof payload.text === "string" ? payload.text.trim() : ""))
        .filter(Boolean)
    : [];

  if (payloadTexts.length > 0) {
    return payloadTexts.join("\n\n").trim();
  }

  const messageTexts = Array.isArray(runResult?.messagingToolSentTexts)
    ? runResult.messagingToolSentTexts.map((text) => String(text).trim()).filter(Boolean)
    : [];
  if (messageTexts.length > 0) {
    return messageTexts.join("\n\n").trim();
  }

  const stopReason = typeof runResult?.meta?.stopReason === "string" ? runResult.meta.stopReason.trim() : "";
  if (stopReason) {
    return `OpenClaw run finished without textual payload (stopReason=${stopReason}).`;
  }

  return "";
}
