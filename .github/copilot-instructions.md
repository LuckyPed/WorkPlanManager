# Copilot Instructions for Work Plan Manager

## Project Overview
Kanban-style task manager with 5 columns (Future Plans, Planned, In Progress, Completed, Archives). Lightweight stack: Node.js + Express backend, vanilla JS frontend, SQLite database.

## Architecture
- `server.js` - Express API with SQLite (sql.js - pure JS, no native deps). All DB logic is inline, no ORM.
- `public/` - Static frontend served by Express. Single-page app with drag-and-drop.
- `data/workplans.db` - SQLite file, auto-created on first run.
- `data/images/` - Stored images pasted into task descriptions.

## Key Patterns

### Backend (server.js)
- Async SQLite using `sql.js` (pure JavaScript, no native compilation)
- RESTful API at `/api/tasks` - standard CRUD + `/reorder` for batch position updates
- Image upload endpoint at `/api/images` (base64 to file)
- Database uses explicit column names in queries (not positional indexes)
- Database is saved to file after each write operation via `saveDb()`
- Static files served from `public/` folder
- All routes defined inline, no router modules

### Frontend (public/)
- Vanilla JavaScript, no frameworks
- DOM manipulation for task rendering
- Native HTML5 drag-and-drop API with auto-scroll near edges
- Modal-based form for add/edit (title, description, follow-up)
- Dark theme with CSS variables in `:root`
- Toast notifications via `showToast()`
- Paste-to-add feature: Ctrl+V on page to bulk-add tasks from clipboard
- Image paste: Ctrl+V in description textarea to add images
- Collapsible task cards (hide/show description and follow-up)
- Task count badges in column headers

### Database Schema
```sql
tasks(id, title, description, followup, column_id, position, created_at, updated_at)
```
- `column_id`: 'future-plans' | 'planned' | 'in-progress' | 'completed' | 'archives'
- `position`: integer for ordering within column
- `followup`: optional notes about task outcomes/updates

## Developer Workflow
```bash
npm install          # Install dependencies
npm start            # Run server on port 3000
docker-compose up -d # Deploy with Docker
```

## Conventions
- Use `async/await` for API calls in frontend, sync for backend DB
- Escape HTML with `escapeHtml()` before rendering user content
- Process descriptions with `processDescription()` to handle images and line breaks
- Column IDs must match: `future-plans`, `planned`, `in-progress`, `completed`, `archives`
- Task positions are 0-indexed integers per column
- Extra columns (Future Plans, Archives) hidden by default, toggled via footer buttons

## Important Reminders
- **Always use `ask_user` tool** to verify changes or ask user to test before finishing any task
- Keep the stack simple - no additional frameworks unless explicitly requested
- SQLite file is in `data/` folder - ensure volume mount for persistence in Docker
- Images stored in `data/images/` - cleaned up when tasks are deleted

## File Quick Reference
| File | Purpose |
|------|---------|
| `server.js` | API routes, DB setup, image handling |
| `public/index.html` | Page structure, modal, 5 columns |
| `public/styles.css` | Dark theme, layout, responsive grid |
| `public/app.js` | CRUD logic, drag-drop, collapse, toggles |
| `docker-compose.yml` | Coolify deployment |
