# Work Plan Manager

A simple, lightweight Kanban-style work plan manager with 3 columns for organizing tasks.

## Features

- **3 Columns**: Planned, In Progress, Completed
- **Drag & Drop**: Move tasks between columns easily
- **CRUD Operations**: Add, edit, delete tasks
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
├── data/               # SQLite database (created at runtime)
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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| DB_PATH | ./data/workplans.db | SQLite database path |
| NODE_ENV | development | Environment mode |
