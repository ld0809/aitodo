---
name: aitodo-knowledge-maintainer
description: Use when working in the AITodo repository and a change may affect project knowledge, including code architecture, business logic, API contracts, database schema, or UI interactions. Also use when asked to update, verify, or rely on the repository knowledge base.
---

# AITodo Knowledge Maintainer

## Purpose

Keep `docs/PROJECT_KNOWLEDGE.md` accurate and useful for future development.

## Required Workflow

1. Read `docs/PROJECT_KNOWLEDGE.md` before implementing non-trivial changes.
2. After code changes, inspect the diff and decide whether project knowledge changed.
3. Update `docs/PROJECT_KNOWLEDGE.md` when any of these changed:
   - backend module/controller/service/entity boundaries
   - API path, DTO, response shape, auth or permission rules
   - database fields, relations, migrations, or persistence semantics
   - todo/card/shared/TAPD/report/miniapp/OpenClaw business rules
   - dashboard views, card interactions, list-mode behavior, modals, or shared UI primitives
4. Keep updates factual and concise. Prefer current code facts over historical plans.
5. If no knowledge update is needed, say so in the final response.

## Reference Files

- `docs/PROJECT_KNOWLEDGE.md`: current source of truth for architecture, business logic, and UI interactions.
- `docs/KNOWLEDGE_MAINTENANCE.md`: detailed maintenance checklist.
- `AGENTS.md`: repository-level rule that makes this workflow mandatory.

## Validation

For changes that update project knowledge:
- Run the normal code validation required by the code change.
- Review the modified documentation for stale statements, especially API paths, entity fields, and UI behavior.
