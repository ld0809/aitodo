import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatchTokens, interpolateTemplate, resolveRoutingPeerId } from "../src/routing.js";
import { extractResultText } from "../src/result.js";

test("buildDispatchTokens keeps server session key and task ids", () => {
  const tokens = buildDispatchTokens({
    dispatchId: "d-1",
    sessionKey: "aitodo:todo:42",
    task: {
      meta: {
        todoId: "42",
        cardId: "c-9",
      },
    },
  });

  assert.deepEqual(tokens, {
    dispatchId: "d-1",
    todoId: "42",
    cardId: "c-9",
    sessionKey: "aitodo:todo:42",
    serverSessionKey: "aitodo:todo:42",
  });
});

test("resolveRoutingPeerId supports rule-based card routing", () => {
  const routingPeerId = resolveRoutingPeerId(
    {
      routingPeerTemplate: "{serverSessionKey}",
      rules: [
        {
          field: "cardId",
          pattern: "^c-",
          routingPeerTemplate: "aitodo:card:{cardId}",
        },
      ],
    },
    {
      dispatchId: "d-1",
      sessionKey: "aitodo:todo:42",
      task: {
        meta: {
          todoId: "42",
          cardId: "c-9",
        },
      },
    },
  );

  assert.equal(routingPeerId, "aitodo:card:c-9");
});

test("interpolateTemplate leaves missing values empty", () => {
  assert.equal(interpolateTemplate("aitodo:{cardId}:{todoId}", { todoId: "42" }), "aitodo::42");
});

test("extractResultText joins textual payloads", () => {
  const text = extractResultText({
    payloads: [
      { text: "目标理解：A" },
      { text: "实施拆解：B" },
    ],
    meta: {
      stopReason: "completed",
    },
  });

  assert.equal(text, "目标理解：A\n\n实施拆解：B");
});
