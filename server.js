const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for images
app.use(express.static('public'));

// Database setup
const dbPath = process.env.DB_PATH || './data/workplans.db';
const dbDir = path.dirname(dbPath);
const imagesDir = path.join(dbDir, 'images');

// Ensure directories exist
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Serve uploaded images
app.use('/images', express.static(imagesDir));

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
      followup TEXT,
      column_id TEXT NOT NULL DEFAULT 'in-progress',
      position INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Add followup column if it doesn't exist (migration for existing databases)
  try {
    db.run('ALTER TABLE tasks ADD COLUMN followup TEXT');
  } catch (e) {
    // Column already exists, ignore
  }
  
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
  const result = db.exec('SELECT id, title, description, followup, column_id, position, created_at, updated_at FROM tasks ORDER BY position ASC');
  if (result.length === 0) {
    return res.json([]);
  }
  
  // Get column names from result
  const columns = result[0].columns;
  const tasks = result[0].values.map(row => {
    const task = {};
    columns.forEach((col, idx) => {
      task[col] = row[idx];
    });
    return task;
  });
  res.json(tasks);
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, followup, column_id } = req.body;
  const colId = column_id || 'in-progress';
  
  // Get max position
  const maxResult = db.exec(`SELECT MAX(position) FROM tasks WHERE column_id = '${colId}'`);
  const maxPos = maxResult.length > 0 && maxResult[0].values[0][0] !== null ? maxResult[0].values[0][0] : -1;
  const position = maxPos + 1;
  
  db.run(
    `INSERT INTO tasks (title, description, followup, column_id, position) VALUES (?, ?, ?, ?, ?)`,
    [title, description || '', followup || '', colId, position]
  );
  saveDb();
  
  // Get the inserted task by finding max id
  const idResult = db.exec('SELECT MAX(id) FROM tasks');
  const newId = idResult[0].values[0][0];
  const result = db.exec(`SELECT id, title, description, followup, column_id, position, created_at, updated_at FROM tasks WHERE id = ${newId}`);
  const columns = result[0].columns;
  const row = result[0].values[0];
  const task = {};
  columns.forEach((col, idx) => { task[col] = row[idx]; });
  res.json(task);
});

// Update task
app.put('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  const { title, description, followup, column_id, position } = req.body;
  
  // Get current task with explicit columns
  const current = db.exec(`SELECT id, title, description, followup, column_id, position FROM tasks WHERE id = ${id}`);
  if (current.length === 0 || current[0].values.length === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  // Map current values by column name
  const currCols = current[0].columns;
  const currRow = current[0].values[0];
  const curr = {};
  currCols.forEach((col, idx) => { curr[col] = currRow[idx]; });
  
  db.run(`
    UPDATE tasks 
    SET title = ?,
        description = ?,
        followup = ?,
        column_id = ?,
        position = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [
    title !== undefined ? title : curr.title,
    description !== undefined ? description : curr.description,
    followup !== undefined ? followup : (curr.followup || ''),
    column_id !== undefined ? column_id : curr.column_id,
    position !== undefined ? position : curr.position,
    id
  ]);
  saveDb();
  
  const result = db.exec(`SELECT id, title, description, followup, column_id, position, created_at, updated_at FROM tasks WHERE id = ${id}`);
  const columns = result[0].columns;
  const row = result[0].values[0];
  const task = {};
  columns.forEach((col, idx) => { task[col] = row[idx]; });
  res.json(task);
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const { id } = req.params;
  
  // Get task to find any images in description
  const taskResult = db.exec(`SELECT description FROM tasks WHERE id = ${id}`);
  if (taskResult.length > 0 && taskResult[0].values.length > 0) {
    const description = taskResult[0].values[0][0];
    if (description) {
      // Find and delete any images referenced in the description
      const imageMatches = description.match(/\[img:\/images\/([^\]]+)\]/g);
      if (imageMatches) {
        imageMatches.forEach(match => {
          const filename = match.match(/\[img:\/images\/([^\]]+)\]/)[1];
          const imagePath = path.join(imagesDir, filename);
          try {
            if (fs.existsSync(imagePath)) {
              fs.unlinkSync(imagePath);
              console.log(`Deleted image: ${filename}`);
            }
          } catch (err) {
            console.error(`Failed to delete image ${filename}:`, err);
          }
        });
      }
    }
  }
  
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

// Upload image
app.post('/api/images', (req, res) => {
  try {
    const { image } = req.body; // base64 data URL
    
    if (!image || !image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image data' });
    }
    
    // Extract base64 data
    const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid image format' });
    }
    
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const buffer = Buffer.from(data, 'base64');
    
    // Generate unique filename
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const filepath = path.join(imagesDir, filename);
    
    // Save file
    fs.writeFileSync(filepath, buffer);
    
    res.json({ url: `/images/${filename}` });
  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
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
