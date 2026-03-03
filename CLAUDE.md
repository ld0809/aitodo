# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Todo Manager - A full-stack application for managing todos from multiple sources with AI-powered prioritization. Built with React (frontend) and NestJS (backend), using SQLite for data persistence.

**Key Features:**
- User authentication with email verification
- Todo management with tags and filtering
- Dashboard with draggable cards (Grafana-style layout)
- Plugin architecture for third-party integrations (TAPD, Jira, GitHub)
- Responsive UI with clean, modern design

## Development Commands

### Backend (NestJS)

```bash
# Development
cd backend
npm install
npm run start:dev          # Start dev server with hot reload (ts-node)
npm run build              # Build TypeScript to dist/
npm start                  # Run compiled JavaScript

# Testing & Quality
npm run lint               # Run ESLint with strict rules (--max-warnings=0)
npm run typecheck          # TypeScript type checking
npm run test:e2e           # Run integration tests (jest-e2e.json, --runInBand)

# Single test file
npm run test:e2e -- test/app.e2e-spec.ts
```

### Frontend (React + Vite)

```bash
# Development
cd client
npm install
npm run dev                # Start Vite dev server (http://localhost:5173)
npm run build              # Build for production
npm run lint               # Run ESLint
npm run preview            # Preview production build

# E2E Testing
npm run test:e2e           # Run Playwright tests (if configured)
```

### Database

- **Type:** SQLite (file-based at `backend/data/app.db`)
- **ORM:** TypeORM
- **Auto-migration:** Runs on first `npm run start:dev`
- **Entities:** Located in `backend/src/database/entities/`

## Architecture Overview

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| State Management | Zustand |
| HTTP Client | Axios + TanStack Query |
| Backend | NestJS 10 + TypeScript |
| Database | SQLite + TypeORM |
| Authentication | JWT + bcrypt |
| Testing | Jest (backend), Playwright (frontend) |

### Project Structure

```
backend/
├── src/
│   ├── auth/              # JWT authentication, email verification
│   ├── users/             # User profile management
│   ├── tags/              # Tag CRUD operations
│   ├── cards/             # Dashboard cards (with layout persistence)
│   ├── todos/             # Todo CRUD operations
│   ├── plugins/           # Plugin architecture for data sources
│   │   ├── adapters/      # TAPD, Jira, GitHub plugins
│   │   └── interfaces/    # DataSourcePlugin interface
│   ├── tapd/              # TAPD integration (Phase 2)
│   ├── database/entities/ # TypeORM entities
│   ├── common/            # Guards, decorators, filters, interceptors
│   └── main.ts            # App entry point
├── test/                  # E2E tests
└── data/                  # SQLite database file

client/
├── src/
│   ├── components/        # Reusable UI components
│   ├── pages/             # Page components (Dashboard, Auth, etc.)
│   ├── api/               # API service layer
│   ├── store/             # Zustand stores
│   ├── App.tsx            # Root component
│   └── main.tsx           # Entry point
├── tests/                 # Playwright E2E tests
└── playwright.config.ts   # Playwright configuration
```

### Key Architectural Patterns

1. **Plugin Architecture:** Backend uses plugin system for extensible data sources
   - `DataSourcePlugin` interface in `backend/src/plugins/interfaces/`
   - Adapters for TAPD, Jira, GitHub in `backend/src/plugins/adapters/`
   - Plugin registry and executor services manage lifecycle

2. **Module-Based Organization:** NestJS modules encapsulate features
   - Each module has controller, service, and DTOs
   - Shared utilities in `common/` folder

3. **State Management:** Zustand stores for client-side state
   - Stores located in `client/src/store/`
   - TanStack Query for server state caching

## Important Implementation Details

### Authentication Flow

1. User registers with email + password
2. Verification code sent to email (6 digits, 5-min expiry)
3. User verifies email to activate account
4. Login returns JWT token (7-day expiry)
5. All protected endpoints require JWT in Authorization header

**Key Files:**
- `backend/src/auth/auth.service.ts` - Core auth logic
- `backend/src/auth/jwt.strategy.ts` - JWT validation
- `backend/src/common/guards/jwt-auth.guard.ts` - Route protection

### Database Schema

**Core Entities:**
- `User` - User accounts with email verification
- `Tag` - User-defined tags with colors
- `Card` - Dashboard cards with tag filters and sort options
- `Todo` - Todo items with due dates, tags, and completion tracking
- `EmailCode` - Temporary email verification codes
- `TapdConfig` - TAPD integration configuration (Phase 2)

**Key Relationships:**
- User → Tags (1:N)
- User → Cards (1:N)
- User → Todos (1:N)
- Card → Todos (1:N, optional)

### API Response Format

All endpoints return standardized responses via `ResponseInterceptor`:

```typescript
// Success (2xx)
{
  statusCode: 200,
  message: "Success message",
  data: { /* response data */ }
}

// Error (4xx, 5xx)
{
  statusCode: 400,
  message: "Error message",
  error: "BadRequest"
}
```

### Code Quality Standards

- **Linting:** ESLint with strict rules (`--max-warnings=0`)
- **Type Safety:** TypeScript strict mode, no `any` types
- **Testing:**
  - Backend: Jest integration tests in `test/` folder
  - Frontend: Playwright E2E tests in `client/tests/`
- **Pre-commit:** Ensure `npm run lint` and `npm run typecheck` pass

## Development Workflow

### Before Starting Work

1. Check git status: `git status`
2. Create feature branch: `git checkout -b feature/description`
3. Install dependencies if needed: `npm install` (in backend or client)

### During Development

1. Run dev server: `npm run start:dev` (backend) or `npm run dev` (frontend)
2. Make changes and test locally
3. Run linting: `npm run lint`
4. Run type checking: `npm run typecheck`
5. Run tests: `npm run test:e2e` (backend) or Playwright tests (frontend)

### Before Committing

1. Ensure all tests pass
2. Ensure no lint errors: `npm run lint`
3. Ensure no type errors: `npm run typecheck`
4. Commit with clear message describing changes

## Common Tasks

### Adding a New API Endpoint

1. Create DTO in `backend/src/[module]/dto/`
2. Add method to service in `backend/src/[module]/[module].service.ts`
3. Add route to controller in `backend/src/[module]/[module].controller.ts`
4. Add integration test in `backend/test/`
5. Update frontend API service in `client/src/api/`

### Adding a New Frontend Component

1. Create component in `client/src/components/`
2. Use Zustand store for state if needed
3. Use Axios + TanStack Query for API calls
4. Add Playwright test in `client/tests/`

### Adding a New Plugin (Phase 2+)

1. Create adapter in `backend/src/plugins/adapters/[plugin-name].plugin.ts`
2. Implement `DataSourcePlugin` interface
3. Register in plugin registry
4. Add configuration entity if needed

## Environment Variables

### Backend (.env)

```env
PORT=3000
DATABASE_PATH=./data/app.db
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

### Frontend (.env)

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## Testing Guidelines

### Backend E2E Tests

- Located in `backend/test/`
- Use Jest with `--runInBand` flag (sequential execution)
- Test full request/response cycle
- Mock external services if needed

### Frontend E2E Tests

- Located in `client/tests/`
- Use Playwright for browser automation
- Test user workflows end-to-end
- Verify console logs and UI elements

## Phase Information

**Current Phase:** Phase 1 (MVP)
- User authentication with email verification
- Todo CRUD operations
- Tag management
- Dashboard with draggable cards
- Basic filtering and sorting

**Phase 2 (Planned):**
- TAPD integration for requirements and bugs
- Advanced filtering and prioritization
- AI-powered recommendations
- Summary reports

## Important Notes

- Database is SQLite (file-based) - suitable for single-user MVP
- Plugin architecture is designed for future extensibility
- All user data is isolated by user_id
- Email verification is required for account activation
- JWT tokens expire after 7 days
- Verification codes expire after 5 minutes
