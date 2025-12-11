# Copilot Instructions for Work Plan Manager

## Project Overview
Simple Kanban-style task manager with 3 columns (Planned, In Progress, Completed). Lightweight stack: Node.js + Express backend, vanilla JS frontend, SQLite database.

## Architecture
- `server.js` - Express API with SQLite (sql.js - pure JS, no native deps). All DB logic is inline, no ORM.
- `public/` - Static frontend served by Express. Single-page app with drag-and-drop.
- `data/workplans.db` - SQLite file, auto-created on first run.

## Key Patterns

### Backend (server.js)
- Async SQLite using `sql.js` (pure JavaScript, no native compilation)
- RESTful API at `/api/tasks` - standard CRUD + `/reorder` for batch position updates
- Database is saved to file after each write operation via `saveDb()`
- Static files served from `public/` folder
- All routes defined inline, no router modules

### Frontend (public/)
- Vanilla JavaScript, no frameworks
- DOM manipulation for task rendering
- Native HTML5 drag-and-drop API
- Modal-based form for add/edit
- Dark theme with CSS variables in `:root`

### Database Schema
```sql
tasks(id, title, description, column_id, position, created_at, updated_at)
```
- `column_id`: 'planned' | 'in-progress' | 'completed'
- `position`: integer for ordering within column

## Developer Workflow
```bash
npm install          # Install dependencies
npm start            # Run server on port 3000
docker-compose up -d # Deploy with Docker
```

## Conventions
- Use `async/await` for API calls in frontend, sync for backend DB
- Escape HTML with `escapeHtml()` before rendering user content
- Column IDs must match: `planned`, `in-progress`, `completed`
- Task positions are 0-indexed integers per column

## Important Reminders
- **Always use `ask_user` tool** to verify changes or ask user to test before finishing any task
- Keep the stack simple - no additional frameworks unless explicitly requested
- SQLite file is in `data/` folder - ensure volume mount for persistence in Docker

## File Quick Reference
| File | Purpose |
|------|---------|
| `server.js` | API routes, DB setup |
| `public/index.html` | Page structure, modal |
| `public/styles.css` | Dark theme, layout |
| `public/app.js` | CRUD logic, drag-drop |
| `docker-compose.yml` | Coolify deployment |
