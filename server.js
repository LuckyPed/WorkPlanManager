const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database setup
const dbPath = process.env.DB_PATH || './data/workplans.db';
const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

// Initialize database
async function initDb() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }
  
  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      column_id TEXT NOT NULL DEFAULT 'in-progress',
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDb();
}

// Save database to file
function saveDb() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

// API Routes

// Get all tasks
app.get('/api/tasks', (req, res) => {
  const result = db.exec('SELECT * FROM tasks ORDER BY position ASC');
  const tasks = result.length > 0 ? result[0].values.map(row => ({
    id: row[0],
    title: row[1],
    description: row[2],
    column_id: row[3],
    position: row[4],
    created_at: row[5],
    updated_at: row[6]
  })) : [];
  res.json(tasks);
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, column_id } = req.body;
  const colId = column_id || 'in-progress';
  
  // Get max position
  const maxResult = db.exec(`SELECT MAX(position) FROM tasks WHERE column_id = '${colId}'`);
  const maxPos = maxResult.length > 0 && maxResult[0].values[0][0] !== null ? maxResult[0].values[0][0] : -1;
  const position = maxPos + 1;
  
  db.run(
    `INSERT INTO tasks (title, description, column_id, position) VALUES (?, ?, ?, ?)`,
    [title, description || '', colId, position]
  );
  saveDb();
  
  // Get the inserted task by finding max id
  const idResult = db.exec('SELECT MAX(id) FROM tasks');
  const newId = idResult[0].values[0][0];
  const result = db.exec(`SELECT * FROM tasks WHERE id = ${newId}`);
  const row = result[0].values[0];
  const task = {
    id: row[0],
    title: row[1],
    description: row[2],
    column_id: row[3],
    position: row[4],
    created_at: row[5],
    updated_at: row[6]
  };
  res.json(task);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, column_id, position } = req.body;
  
  // Get current task
  const current = db.exec(`SELECT * FROM tasks WHERE id = ${id}`);
  if (current.length === 0 || current[0].values.length === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }
  const curr = current[0].values[0];
  
  db.run(`
    UPDATE tasks 
    SET title = ?,
        description = ?,
        column_id = ?,
        position = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    title !== undefined ? title : curr[1],
    description !== undefined ? description : curr[2],
    column_id !== undefined ? column_id : curr[3],
    position !== undefined ? position : curr[4],
    id
  ]);
  saveDb();
  
  const result = db.exec(`SELECT * FROM tasks WHERE id = ${id}`);
  const row = result[0].values[0];
  const task = {
    id: row[0],
    title: row[1],
    description: row[2],
    column_id: row[3],
    position: row[4],
    created_at: row[5],
    updated_at: row[6]
  };
  res.json(task);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  db.run(`DELETE FROM tasks WHERE id = ?`, [id]);
  saveDb();
  res.json({ success: true });
});

// Reorder tasks (batch update positions)
app.post('/api/tasks/reorder', (req, res) => {
  const { tasks } = req.body;
  
  for (const item of tasks) {
    db.run(`UPDATE tasks SET column_id = ?, position = ? WHERE id = ?`, 
      [item.column_id, item.position, item.id]);
  }
  saveDb();
  res.json({ success: true });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server after DB init
initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`WorkPlan Manager running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
