# Repository Guidelines

## Project Structure & Module Organization
This repository is split into two apps:
- `backend/`: NestJS + TypeScript API (`src/` modules like `auth`, `todos`, `cards`, `tapd`, `plugins`; integration tests in `test/`; build output in `dist/`).
- `client/`: React + Vite frontend (`src/` with `pages`, `components`, `api`, `store`; Playwright tests in `tests/`; build output in `dist/`).
- `docs/`: product and architecture docs (`PRD.md`, `ARCHITECTURE.md`).

Keep new domain logic inside the existing module boundaries (e.g., TAPD changes under `backend/src/tapd` or `backend/src/plugins/adapters`).

## Build, Test, and Development Commands
Run commands from each app directory.

Backend (`backend/`):
- `npm run start:dev`: start API in watch/dev mode.
- `npm run build`: compile TS to `dist/`.
- `npm run lint`: run ESLint on `src` and `test`.
- `npm run typecheck`: strict TS check with no emit.
- `npm run test:e2e`: run Jest integration/e2e suite.

Frontend (`client/`):
- `npm run dev`: start Vite dev server.
- `npm run build`: type-check + production build.
- `npm run lint`: run frontend ESLint.
- `npx playwright test`: run e2e flows in `client/tests`.

## Coding Style & Naming Conventions
- TypeScript is strict in both apps; fix all type errors before PR.
- Use 2-space indentation.
- Backend follows NestJS naming: `*.module.ts`, `*.controller.ts`, `*.service.ts`, DTOs in `dto/`.
- Frontend components/pages/stores use PascalCase for components (`TodoCard.tsx`) and camelCase for helpers/API modules.
- Keep files focused: avoid mixing UI, state, and API concerns in one file.
- Frontend shared UI must be built on reusable components under `client/src/components/ui` when the same interaction pattern appears in multiple places.
- New buttons must reuse the shared button component (current entry: `client/src/components/ui/Button.tsx`); do not create page-local button styles for primary/secondary/danger actions.
- When a shared control needs a new visual style or state, extend the shared component and its variants centrally instead of redefining radius, colors, hover, or disabled styles in page/component CSS.
- Before adding a new UI primitive, check whether an existing shared component can be reused or extended. Repeated ad hoc redesign is not acceptable.
- Design tokens such as radius, colors, borders, and shadows should stay aligned with the global variables in `client/src/index.css`; avoid hard-coding a separate visual system in feature files.

## Testing Guidelines
- Backend tests use Jest and `*.e2e-spec.ts` naming under `backend/test`.
- Frontend e2e tests use Playwright and `*.spec.ts` naming under `client/tests`.
- Add or update tests for auth, todo/card CRUD, layout behavior, and TAPD-related changes.

## Commit & Pull Request Guidelines
- Follow concise Conventional Commit style when possible (seen in history): `feat:`, `fix:`, `debug:`.
- One logical change per commit; use clear scope in message body when needed.
- PRs should include: summary, affected areas (`backend`/`client`), test evidence (command output), and screenshots/videos for UI changes.

## Security & Configuration Tips
- Do not commit secrets; keep env values in local `.env` files (`backend/.env`, `client/.env`).
- Treat SQLite/data files as local runtime artifacts unless intentionally versioned.
