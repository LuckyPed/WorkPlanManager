# Work Plan Manager

A lightweight Kanban-style work plan manager with 5 columns for organizing tasks.

## Features

- **5 Columns**: Future Plans, Planned, In Progress, Completed, Archives
- **Drag & Drop**: Move tasks between columns with auto-scroll near edges
- **Collapsible Tasks**: Expand/collapse task cards to show/hide details
- **Follow-up Notes**: Track task outcomes and updates
- **Task Count Badges**: See count of tasks in each column header
- **Image Support**: Paste images directly into task descriptions
- **Bulk Import**: Ctrl+V on page to bulk-add tasks from clipboard
- **Move Buttons**: Reorder tasks within a column
- **Dark Mode**: Modern dark theme
- **Persistent Storage**: SQLite database
- **Docker Ready**: Deploy easily with Docker/Coolify

## Quick Start

### Local Development

```bash
npm install
npm start
```

Open http://localhost:3000

### Docker

```bash
docker-compose up -d
```

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Node.js + Express
- **Database**: SQLite (via sql.js - pure JavaScript)
- **Deployment**: Docker

## Project Structure

```
WorkPlanManager/
├── server.js           # Express API server
├── public/
│   ├── index.html      # Main HTML page
│   ├── styles.css      # Dark mode styling
│   └── app.js          # Frontend JavaScript
├── data/
│   ├── workplans.db    # SQLite database (created at runtime)
│   └── images/         # Uploaded images
├── Dockerfile
├── docker-compose.yml
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tasks | Get all tasks |
| POST | /api/tasks | Create new task |
| PUT | /api/tasks/:id | Update task |
| DELETE | /api/tasks/:id | Delete task |
| POST | /api/tasks/reorder | Batch update positions |
| POST | /api/images | Upload image (base64) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DB_PATH | ./data/workplans.db | SQLite database path |
| NODE_ENV | development | Environment mode |
