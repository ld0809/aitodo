function asString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function buildDispatchTokens(payload) {
  const taskMeta = payload?.task?.meta && typeof payload.task.meta === "object" ? payload.task.meta : {};
  const todoId = asString(taskMeta.todoId);
  const cardId = asString(taskMeta.cardId);
  const serverSessionKey = asString(payload?.sessionKey) || (todoId ? `aitodo:todo:${todoId}` : "");
  const dispatchId = asString(payload?.dispatchId);

  return {
    dispatchId,
    todoId,
    cardId,
    sessionKey: serverSessionKey,
    serverSessionKey,
  };
}

export function interpolateTemplate(template, tokens) {
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const value = tokens[key];
    return typeof value === "string" ? value : "";
  });
}

function matchesRule(rule, tokens) {
  const candidate = tokens[rule.field];
  if (!candidate) {
    return false;
  }

  try {
    return new RegExp(rule.pattern).test(candidate);
  } catch {
    return false;
  }
}

export function resolveRoutingPeerId(account, payload) {
  const tokens = buildDispatchTokens(payload);
  const matchedRule = account.rules.find((rule) => matchesRule(rule, tokens));
  const template = matchedRule?.routingPeerTemplate ?? account.routingPeerTemplate;
  return interpolateTemplate(template, tokens) || tokens.serverSessionKey || tokens.todoId || tokens.dispatchId;
}
