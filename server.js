const express = require('express');
const initSqlJs = require('sql.js');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_USER = process.env.AUTH_USER || '';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

// Generate a secret for signing tokens (derived from credentials, stable across restarts)
const TOKEN_SECRET = AUTH_USER && AUTH_PASSWORD 
  ? crypto.createHash('sha256').update(`${AUTH_USER}:${AUTH_PASSWORD}:wpm-secret-salt`).digest('hex')
  : '';

// Cookie-based auth: generate a signed token that lasts 6 months
function generateAuthToken() {
  const expiry = Date.now() + (180 * 24 * 60 * 60 * 1000); // 6 months
  const payload = `${AUTH_USER}:${expiry}`;
  const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return `${payload}:${signature}`;
}

function verifyAuthToken(token) {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 3) return false;
  
  const [user, expiry, signature] = parts;
  
  // Check expiry
  if (Date.now() > parseInt(expiry)) return false;
  
  // Verify signature
  const payload = `${user}:${expiry}`;
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [key, ...val] = c.trim().split('=');
    if (key) cookies[key.trim()] = decodeURIComponent(val.join('='));
  });
  return cookies;
}

// Auth middleware (only active when AUTH_USER and AUTH_PASSWORD are set)
function authMiddleware(req, res, next) {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    return next(); // No auth configured
  }
  
  // Allow login page and login API without auth
  if (req.path === '/login' || req.path === '/api/auth/login' || req.path === '/api/auth/check') {
    return next();
  }
  
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['wpm_auth'];
  
  if (token && verifyAuthToken(token)) {
    return next(); // Valid token
  }
  
  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // For page requests, redirect to login
  return res.redirect('/login');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow larger payloads for images

// Login page (served before auth middleware for static files)
app.get('/login', (req, res) => {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    return res.redirect('/');
  }
  // Check if already authenticated
  const cookies = parseCookies(req.headers.cookie);
  if (cookies['wpm_auth'] && verifyAuthToken(cookies['wpm_auth'])) {
    return res.redirect('/');
  }
  res.send(getLoginPageHTML());
});

// Login API
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    const token = generateAuthToken();
    res.setHeader('Set-Cookie', `wpm_auth=${encodeURIComponent(token)}; Path=/; Max-Age=${180 * 24 * 60 * 60}; HttpOnly; SameSite=Strict${req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`);
    return res.json({ success: true });
  }
  
  return res.status(401).json({ error: 'Invalid username or password' });
});

// Auth check endpoint
app.get('/api/auth/check', (req, res) => {
  if (!AUTH_USER || !AUTH_PASSWORD) {
    return res.json({ authenticated: true, authEnabled: false });
  }
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['wpm_auth'];
  const authenticated = token && verifyAuthToken(token);
  res.json({ authenticated, authEnabled: true });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', `wpm_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`);
  res.json({ success: true });
});

// Apply auth middleware AFTER login routes
app.use(authMiddleware);
app.use(express.static('public'));

// Login page HTML
function getLoginPageHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Work Plan Manager</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #eee;
    }
    .login-box {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 2.5rem;
      width: 90%;
      max-width: 380px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.4);
    }
    .login-box h1 {
      text-align: center;
      margin-bottom: 0.5rem;
      font-size: 1.5rem;
    }
    .login-box .subtitle {
      text-align: center;
      color: #aaa;
      font-size: 0.85rem;
      margin-bottom: 2rem;
    }
    .form-group {
      margin-bottom: 1.25rem;
    }
    .form-group label {
      display: block;
      margin-bottom: 0.4rem;
      font-size: 0.85rem;
      color: #aaa;
    }
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 8px;
      background: rgba(0,0,0,0.25);
      color: #eee;
      font-size: 1rem;
      font-family: inherit;
      transition: border-color 0.2s;
    }
    .form-group input:focus {
      outline: none;
      border-color: #e94560;
    }
    .login-btn {
      width: 100%;
      padding: 0.85rem;
      border: none;
      border-radius: 8px;
      background: #e94560;
      color: white;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 0.5rem;
    }
    .login-btn:hover { background: #ff6b6b; }
    .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .error-msg {
      color: #ff6b6b;
      text-align: center;
      font-size: 0.85rem;
      margin-top: 1rem;
      min-height: 1.2rem;
    }
    .remember-note {
      text-align: center;
      color: #666;
      font-size: 0.75rem;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="login-box">
    <h1>\ud83d\udccb Work Plan Manager</h1>
    <p class="subtitle">Please sign in to continue</p>
    <form id="loginForm">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" autocomplete="username" required autofocus>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" autocomplete="current-password" required>
      </div>
      <button type="submit" class="login-btn" id="loginBtn">Sign In</button>
      <div class="error-msg" id="errorMsg"></div>
    </form>
    <p class="remember-note">\ud83d\udd12 You'll stay signed in for 6 months</p>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('loginBtn');
      const errorMsg = document.getElementById('errorMsg');
      btn.disabled = true;
      btn.textContent = 'Signing in...';
      errorMsg.textContent = '';
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
          })
        });
        
        if (res.ok) {
          window.location.href = '/';
        } else {
          const data = await res.json();
          errorMsg.textContent = data.error || 'Login failed';
        }
      } catch (err) {
        errorMsg.textContent = 'Connection error';
      }
      
      btn.disabled = false;
      btn.textContent = 'Sign In';
    });
  </script>
</body>
</html>`;
}

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
  
  // Get task to find any images in description and followup
  const taskResult = db.exec(`SELECT description, followup FROM tasks WHERE id = ${id}`);
  if (taskResult.length > 0 && taskResult[0].values.length > 0) {
    const description = taskResult[0].values[0][0];
    const followup = taskResult[0].values[0][1];
    
    // Clean up images from both description and followup
    const allText = [description, followup].filter(Boolean).join(' ');
    if (allText) {
      const imageMatches = allText.match(/\[img:\/images\/([^\]]+)\]/g);
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
