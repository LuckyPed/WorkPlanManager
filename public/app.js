const API_URL = '/api/tasks';

let tasks = [];
let draggedTask = null;
let syncInterval = 30; // seconds
let syncTimer = null;
let lastSyncTime = null;
let countdownTimer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  setupDragAndDrop();
  setupForm();
  setupPasteToAdd();
  setupAutoSync();
  setupDataControls();
});

// Load tasks from API
async function loadTasks() {
  try {
    const response = await fetch(API_URL);
    tasks = await response.json();
    renderTasks();
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

// Render tasks to columns
function renderTasks() {
  const columns = ['planned', 'in-progress', 'completed'];
  
  columns.forEach(columnId => {
    const container = document.getElementById(columnId);
    const columnTasks = tasks
      .filter(t => t.column_id === columnId)
      .sort((a, b) => a.position - b.position);
    
    if (columnTasks.length === 0) {
      container.innerHTML = '<div class="empty-state">Drop tasks here</div>';
    } else {
      container.innerHTML = columnTasks.map(task => createTaskHTML(task)).join('');
    }
  });

  // Re-attach drag events and double-click to new elements
  document.querySelectorAll('.task').forEach(taskEl => {
    setupTaskDrag(taskEl);
    // Double-click to edit
    taskEl.addEventListener('dblclick', (e) => {
      // Ignore if clicking on action buttons
      if (e.target.closest('.task-actions')) return;
      const taskId = parseInt(taskEl.dataset.id);
      editTask(taskId);
    });
  });
}

// Create task HTML
function createTaskHTML(task) {
  return `
    <div class="task" draggable="true" data-id="${task.id}">
      <div class="task-actions">
        <button class="edit-btn" onclick="editTask(${task.id})" title="Edit">✏️</button>
        <button class="delete-btn" onclick="deleteTask(${task.id})" title="Delete">🗑️</button>
      </div>
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-desc">${escapeHtml(task.description).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Setup drag and drop
function setupDragAndDrop() {
  document.querySelectorAll('.tasks').forEach(container => {
    container.addEventListener('dragover', handleDragOver);
    container.addEventListener('dragleave', handleDragLeave);
    container.addEventListener('drop', handleDrop);
  });
}

function setupTaskDrag(taskEl) {
  taskEl.addEventListener('dragstart', handleDragStart);
  taskEl.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
  draggedTask = e.target;
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  document.querySelectorAll('.tasks').forEach(c => c.classList.remove('drag-over'));
  draggedTask = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
  e.dataTransfer.dropEffect = 'move';
  
  // Show drop indicator
  const container = e.currentTarget;
  const dropY = e.clientY;
  const taskElements = Array.from(container.querySelectorAll('.task:not(.dragging)'));
  
  // Remove existing indicators
  container.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  
  // Find position and add indicator
  let insertBefore = null;
  for (const taskEl of taskElements) {
    const rect = taskEl.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (dropY < midY) {
      insertBefore = taskEl;
      break;
    }
  }
  
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  
  if (insertBefore) {
    container.insertBefore(indicator, insertBefore);
  } else {
    container.appendChild(indicator);
  }
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
  e.currentTarget.querySelectorAll('.drop-indicator').forEach(el => el.remove());
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  e.currentTarget.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  
  if (!draggedTask) return;
  
  const container = e.currentTarget;
  const newColumnId = container.id;
  const taskId = parseInt(draggedTask.dataset.id);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) return;
  
  const oldColumnId = task.column_id;
  
  // Get drop position based on where user dropped
  const dropY = e.clientY;
  const taskElements = Array.from(container.querySelectorAll('.task:not(.dragging)'));
  
  let newPosition = 0;
  for (let i = 0; i < taskElements.length; i++) {
    const rect = taskElements[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (dropY > midY) {
      newPosition = i + 1;
    }
  }
  
  // Update task column
  task.column_id = newColumnId;
  
  // Get all tasks in the target column (excluding the dragged one)
  const columnTasks = tasks
    .filter(t => t.column_id === newColumnId && t.id !== taskId)
    .sort((a, b) => a.position - b.position);
  
  // Insert at new position
  columnTasks.splice(newPosition, 0, task);
  
  // Update positions
  columnTasks.forEach((t, idx) => t.position = idx);
  
  // If moved between columns, also update old column positions
  if (oldColumnId !== newColumnId) {
    const oldColumnTasks = tasks
      .filter(t => t.column_id === oldColumnId)
      .sort((a, b) => a.position - b.position);
    oldColumnTasks.forEach((t, idx) => t.position = idx);
  }
  
  // Save to server
  try {
    const tasksToUpdate = oldColumnId !== newColumnId 
      ? [...columnTasks, ...tasks.filter(t => t.column_id === oldColumnId)]
      : columnTasks;
    
    await fetch(`${API_URL}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasksToUpdate.map(t => ({ id: t.id, column_id: t.column_id, position: t.position })) })
    });
    renderTasks();
  } catch (error) {
    console.error('Error reordering:', error);
  }
}

// Modal functions
function openModal(columnId, taskId = null) {
  const modal = document.getElementById('taskModal');
  const title = document.getElementById('modalTitle');
  const form = document.getElementById('taskForm');
  
  form.reset();
  document.getElementById('taskColumn').value = columnId;
  
  if (taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      title.textContent = 'Edit Task';
      document.getElementById('taskId').value = task.id;
      document.getElementById('taskTitleInput').value = task.title;
      document.getElementById('taskDesc').value = task.description || '';
    }
  } else {
    title.textContent = 'Add Task';
    document.getElementById('taskId').value = '';
  }
  
  modal.classList.add('active');
  document.getElementById('taskTitleInput').focus();
}

function closeModal() {
  document.getElementById('taskModal').classList.remove('active');
}

function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    openModal(task.column_id, id);
  }
}

async function deleteTask(id) {
  // No confirmation - just delete with smooth animation
  const taskEl = document.querySelector(`.task[data-id="${id}"]`);
  if (taskEl) {
    taskEl.style.transform = 'translateX(100%)';
    taskEl.style.opacity = '0';
  }
  
  try {
    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== id);
    setTimeout(() => renderTasks(), 200);
    showToast('Task deleted');
  } catch (error) {
    console.error('Error deleting:', error);
    renderTasks(); // Restore on error
  }
}

// Toast notification
function showToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Remove after delay
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// Form handling
function setupForm() {
  document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitleInput').value.trim();
    const description = document.getElementById('taskDesc').value.trim();
    const column_id = document.getElementById('taskColumn').value;
    
    if (!title) return;
    
    try {
      if (id) {
        // Update existing
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        const updated = await response.json();
        const idx = tasks.findIndex(t => t.id === parseInt(id));
        if (idx !== -1) tasks[idx] = updated;
      } else {
        // Create new
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, column_id })
        });
        const newTask = await response.json();
        tasks.push(newTask);
        showToast('Task added');
      }
      
      closeModal();
      renderTasks();
    } catch (error) {
      console.error('Error saving:', error);
      showToast('Error saving task');
    }
  });
  
  // Close modal on outside click
  document.getElementById('taskModal').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
      closeModal();
    }
  });
  
  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

// Paste to add multiple tasks
function setupPasteToAdd() {
  document.addEventListener('paste', async (e) => {
    // Ignore if pasting inside input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    // Check if modal is open - ignore paste
    if (document.getElementById('taskModal').classList.contains('active')) return;
    
    const clipboardText = e.clipboardData.getData('text');
    if (!clipboardText.trim()) return;
    
    // Find which column to paste into (check if hovering over a column)
    const columns = document.querySelectorAll('.column');
    let targetColumnId = null;
    
    // Try to detect hovered column
    for (const col of columns) {
      const rect = col.getBoundingClientRect();
      // Use a simple heuristic - check mouse position would need extra tracking
      // For now, use a visual indicator approach
    }
    
    // Parse lines - split by newlines and filter
    const lines = clipboardText
      .split('\n')
      .map(line => line.trim())
      .map(line => {
        // Remove common bullet prefixes
        return line
          .replace(/^[-•*]\s*/, '')    // Remove -, •, *
          .replace(/^\d+[.)]\s*/, '')  // Remove numbered lists like "1." or "1)"
          .trim();
      })
      .filter(line => line.length > 0);
    
    if (lines.length === 0) return;
    
    // Show paste dialog to select column
    showPasteDialog(lines);
  });
}

// Paste dialog for selecting column
function showPasteDialog(lines) {
  // Create dialog
  const dialog = document.createElement('div');
  dialog.className = 'paste-dialog';
  dialog.innerHTML = `
    <div class="paste-dialog-content">
      <h3>📋 Paste ${lines.length} task${lines.length > 1 ? 's' : ''}</h3>
      <div class="paste-preview">
        ${lines.slice(0, 5).map(l => `<div class="paste-item">${escapeHtml(l.substring(0, 60))}${l.length > 60 ? '...' : ''}</div>`).join('')}
        ${lines.length > 5 ? `<div class="paste-more">... and ${lines.length - 5} more</div>` : ''}
      </div>
      <p>Add to which column?</p>
      <div class="paste-buttons">
        <button class="paste-btn planned" onclick="confirmPaste('planned')">📝 Planned</button>
        <button class="paste-btn in-progress" onclick="confirmPaste('in-progress')">🔄 In Progress</button>
        <button class="paste-btn completed" onclick="confirmPaste('completed')">✅ Completed</button>
      </div>
      <button class="paste-cancel" onclick="closePasteDialog()">Cancel</button>
    </div>
  `;
  
  // Store lines for later
  dialog.dataset.lines = JSON.stringify(lines);
  document.body.appendChild(dialog);
  
  // Show with animation
  setTimeout(() => dialog.classList.add('active'), 10);
}

function closePasteDialog() {
  const dialog = document.querySelector('.paste-dialog');
  if (dialog) {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 200);
  }
}

async function confirmPaste(columnId) {
  const dialog = document.querySelector('.paste-dialog');
  if (!dialog) return;
  
  const lines = JSON.parse(dialog.dataset.lines);
  closePasteDialog();
  
  // Create tasks one by one
  let added = 0;
  for (const title of lines) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description: '', column_id: columnId })
      });
      const newTask = await response.json();
      tasks.push(newTask);
      added++;
    } catch (error) {
      console.error('Error adding task:', error);
    }
  }
  
  renderTasks();
  showToast(`Added ${added} task${added > 1 ? 's' : ''}`);
}

// Auto-sync functionality
function setupAutoSync() {
  // Load saved interval from localStorage
  const savedInterval = localStorage.getItem('syncInterval');
  if (savedInterval) {
    syncInterval = parseInt(savedInterval);
  }
  
  startSyncTimer();
  updateSyncDisplay();
  
  // Setup sync controls - set saved value in dropdown
  const selectEl = document.getElementById('syncInterval');
  selectEl.value = syncInterval;
  // If saved value doesn't exist in dropdown, default to 30
  if (selectEl.value !== syncInterval.toString()) {
    syncInterval = 30;
    selectEl.value = 30;
  }
  
  selectEl.addEventListener('change', (e) => {
    const newInterval = parseInt(e.target.value);
    syncInterval = newInterval;
    localStorage.setItem('syncInterval', syncInterval);
    
    if (newInterval === 0) {
      stopSyncTimer();
      showToast('Auto-sync disabled');
    } else {
      restartSyncTimer();
      showToast(`Sync: ${newInterval >= 60 ? (newInterval/60) + 'm' : newInterval + 's'}`);
    }
  });
  
  // Manual sync button
  document.getElementById('syncNow').addEventListener('click', () => {
    syncTasks();
  });
}

function startSyncTimer() {
  // Clear existing timers
  if (syncTimer) clearInterval(syncTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  
  // If sync is disabled, show off state
  if (syncInterval === 0) {
    updateCountdown('Off');
    document.querySelector('.sync-dot').style.background = 'var(--text-secondary)';
    document.querySelector('.sync-dot').style.animation = 'none';
    return;
  }
  
  // Restore dot animation
  document.querySelector('.sync-dot').style.background = 'var(--success)';
  document.querySelector('.sync-dot').style.animation = 'pulse-dot 2s ease-in-out infinite';
  
  // Start sync interval
  syncTimer = setInterval(syncTasks, syncInterval * 1000);
  
  // Start countdown display
  let countdown = syncInterval;
  updateCountdown(countdown);
  countdownTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) countdown = syncInterval;
    updateCountdown(countdown);
  }, 1000);
}

function stopSyncTimer() {
  if (syncTimer) clearInterval(syncTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  syncTimer = null;
  countdownTimer = null;
  updateCountdown('Off');
  document.querySelector('.sync-dot').style.background = 'var(--text-secondary)';
  document.querySelector('.sync-dot').style.animation = 'none';
}

function restartSyncTimer() {
  startSyncTimer();
}

async function syncTasks() {
  try {
    const response = await fetch(API_URL);
    const serverTasks = await response.json();
    
    // Check if tasks have changed
    const tasksChanged = JSON.stringify(tasks) !== JSON.stringify(serverTasks);
    
    if (tasksChanged) {
      tasks = serverTasks;
      renderTasks();
      showToast('Tasks synced');
    }
    
    lastSyncTime = new Date();
    updateSyncDisplay();
  } catch (error) {
    console.error('Sync error:', error);
  }
}

function updateCountdown(seconds) {
  const el = document.getElementById('syncCountdown');
  if (el) el.textContent = `${seconds}s`;
}

function updateSyncDisplay() {
  const el = document.getElementById('lastSync');
  if (el && lastSyncTime) {
    el.textContent = `Last: ${lastSyncTime.toLocaleTimeString()}`;
  }
}

// Export/Import functionality
function setupDataControls() {
  // Export button
  document.getElementById('exportBtn').addEventListener('click', exportTasks);
  
  // Import file input
  document.getElementById('importFile').addEventListener('change', importTasks);
}

function exportTasks() {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: tasks.map(t => ({
      title: t.title,
      description: t.description,
      column_id: t.column_id,
      position: t.position
    }))
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `workplan-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast(`Exported ${tasks.length} tasks`);
}

async function importTasks(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate structure
    if (!data.tasks || !Array.isArray(data.tasks)) {
      throw new Error('Invalid file format');
    }
    
    // Show confirmation with preview
    const count = data.tasks.length;
    const preview = data.tasks.slice(0, 3).map(t => t.title).join(', ');
    
    showImportDialog(data.tasks, count, preview);
  } catch (error) {
    console.error('Import error:', error);
    showToast('Invalid backup file');
  }
  
  // Reset file input
  e.target.value = '';
}

function showImportDialog(importedTasks, count, preview) {
  const dialog = document.createElement('div');
  dialog.className = 'paste-dialog';
  dialog.innerHTML = `
    <div class="paste-dialog-content">
      <h3>📤 Import ${count} Task${count > 1 ? 's' : ''}</h3>
      <div class="paste-preview">
        <div class="paste-item">${escapeHtml(preview)}${count > 3 ? '...' : ''}</div>
      </div>
      <p>How would you like to import?</p>
      <div class="paste-buttons" style="flex-direction: column; gap: 0.75rem;">
        <button class="paste-btn" onclick="confirmImport('merge')" style="width: 100%;">
          ➕ Merge with existing tasks
        </button>
        <button class="paste-btn" onclick="confirmImport('replace')" style="width: 100%; color: var(--accent);">
          🔄 Replace all tasks
        </button>
      </div>
      <button class="paste-cancel" onclick="closeImportDialog()">Cancel</button>
    </div>
  `;
  
  // Store tasks for later
  dialog.dataset.tasks = JSON.stringify(importedTasks);
  document.body.appendChild(dialog);
  setTimeout(() => dialog.classList.add('active'), 10);
}

function closeImportDialog() {
  const dialog = document.querySelector('.paste-dialog');
  if (dialog) {
    dialog.classList.remove('active');
    setTimeout(() => dialog.remove(), 200);
  }
}

async function confirmImport(mode) {
  const dialog = document.querySelector('.paste-dialog');
  if (!dialog) return;
  
  const importedTasks = JSON.parse(dialog.dataset.tasks);
  closeImportDialog();
  
  try {
    // If replace mode, delete all existing tasks first
    if (mode === 'replace') {
      for (const task of tasks) {
        await fetch(`${API_URL}/${task.id}`, { method: 'DELETE' });
      }
      tasks = [];
    }
    
    // Import tasks
    let added = 0;
    for (const task of importedTasks) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: task.title,
          description: task.description || '',
          column_id: task.column_id || 'planned'
        })
      });
      
      if (response.ok) {
        const newTask = await response.json();
        tasks.push(newTask);
        added++;
      }
    }
    
    renderTasks();
    showToast(`Imported ${added} task${added > 1 ? 's' : ''}`);
  } catch (error) {
    console.error('Import error:', error);
    showToast('Import failed');
  }
}
