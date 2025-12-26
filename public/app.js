const API_URL = '/api/tasks';

let tasks = [];
let draggedTask = null;
let syncInterval = 30; // seconds
let syncTimer = null;
let lastSyncTime = null;
let countdownTimer = null;
let futurePlansVisible = false;
let archivesVisible = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  setupDragAndDrop();
  setupForm();
  setupPasteToAdd();
  setupAutoSync();
  setupDataControls();
  loadColumnStates();
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
  const columns = ['future-plans', 'planned', 'in-progress', 'completed', 'archives'];
  
  columns.forEach(columnId => {
    const container = document.getElementById(columnId);
    if (!container) return;
    
    const columnTasks = tasks
      .filter(t => t.column_id === columnId)
      .sort((a, b) => a.position - b.position);
    
    if (columnTasks.length === 0) {
      container.innerHTML = columnId === 'archives' 
        ? '<div class="empty-state">No archived tasks</div>'
        : '<div class="empty-state">Drop tasks here</div>';
    } else {
      container.innerHTML = columnTasks.map(task => createTaskHTML(task, columnId === 'archives')).join('');
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
function createTaskHTML(task, isArchive = false) {
  if (isArchive) {
    // Archive tasks have restore and permanent delete buttons
    return `
      <div class="task" draggable="true" data-id="${task.id}">
        <div class="task-actions">
          <button class="restore-btn" onclick="restoreTask(${task.id})" title="Restore to Planned">↩️</button>
          <button class="delete-btn" onclick="permanentDeleteTask(${task.id})" title="Delete permanently">🗑️</button>
        </div>
        <div class="task-title">${escapeHtml(task.title)}</div>
        ${task.description ? `<div class="task-desc">${processDescription(task.description)}</div>` : ''}
      </div>
    `;
  }
  
  return `
    <div class="task" draggable="true" data-id="${task.id}">
      <div class="task-actions">
        <button class="edit-btn" onclick="editTask(${task.id})" title="Edit">✏️</button>
        <button class="delete-btn" onclick="deleteTask(${task.id})" title="Archive">🗑️</button>
      </div>
      <div class="task-title">${escapeHtml(task.title)}</div>
      ${task.description ? `<div class="task-desc">${processDescription(task.description)}</div>` : ''}
      <div class="task-move-actions">
        <button class="move-btn" onclick="moveTask(${task.id}, -1)" title="Move up">▲</button>
        <button class="move-btn" onclick="moveTask(${task.id}, 1)" title="Move down">▼</button>
      </div>
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
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  draggedTask = null;
  lastIndicatorPosition = null;
}

// Track last indicator position to prevent flickering
let lastIndicatorPosition = null;

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const container = e.currentTarget;
  container.classList.add('drag-over');
  e.dataTransfer.dropEffect = 'move';
  
  // Only update indicator if mouse moved significantly
  const dropY = e.clientY;
  
  // Find position for indicator
  const taskElements = Array.from(container.querySelectorAll('.task:not(.dragging)'));
  let insertBeforeId = null;
  
  for (const taskEl of taskElements) {
    const rect = taskEl.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (dropY < midY) {
      insertBeforeId = taskEl.dataset.id;
      break;
    }
  }
  
  // Only update DOM if position changed
  const positionKey = `${container.id}-${insertBeforeId || 'end'}`;
  if (lastIndicatorPosition === positionKey) return;
  lastIndicatorPosition = positionKey;
  
  // Remove existing indicators from ALL containers
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  
  // Create new indicator
  const indicator = document.createElement('div');
  indicator.className = 'drop-indicator';
  
  const insertBefore = insertBeforeId ? container.querySelector(`.task[data-id="${insertBeforeId}"]`) : null;
  if (insertBefore) {
    container.insertBefore(indicator, insertBefore);
  } else {
    container.appendChild(indicator);
  }
}

function handleDragLeave(e) {
  // Only handle if actually leaving the container (not entering a child)
  if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget)) return;
  
  e.currentTarget.classList.remove('drag-over');
  e.currentTarget.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  lastIndicatorPosition = null;
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  lastIndicatorPosition = null;
  
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

// Move task up (-1) or down (+1) within column
async function moveTask(id, direction) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  
  // Get tasks in same column, sorted by position
  const columnTasks = tasks
    .filter(t => t.column_id === task.column_id)
    .sort((a, b) => a.position - b.position);
  
  const currentIndex = columnTasks.findIndex(t => t.id === id);
  const newIndex = currentIndex + direction;
  
  // Check bounds
  if (newIndex < 0 || newIndex >= columnTasks.length) return;
  
  // Swap positions
  const otherTask = columnTasks[newIndex];
  const tempPos = task.position;
  task.position = otherTask.position;
  otherTask.position = tempPos;
  
  // Save to server
  try {
    await fetch(`${API_URL}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        tasks: [
          { id: task.id, column_id: task.column_id, position: task.position },
          { id: otherTask.id, column_id: otherTask.column_id, position: otherTask.position }
        ]
      })
    });
    renderTasks();
  } catch (error) {
    console.error('Error moving task:', error);
  }
}

// Archive task instead of deleting (soft delete)
async function deleteTask(id) {
  const taskEl = document.querySelector(`.task[data-id="${id}"]`);
  if (taskEl) {
    taskEl.style.transform = 'translateX(100%)';
    taskEl.style.opacity = '0';
  }
  
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  
  try {
    // Move to archives column
    const archiveTasks = tasks.filter(t => t.column_id === 'archives');
    const newPosition = archiveTasks.length;
    
    await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_id: 'archives', position: newPosition })
    });
    
    task.column_id = 'archives';
    task.position = newPosition;
    
    setTimeout(() => renderTasks(), 200);
    showToast('Task archived');
  } catch (error) {
    console.error('Error archiving:', error);
    renderTasks();
  }
}

// Restore task from archives to planned
async function restoreTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  
  try {
    const plannedTasks = tasks.filter(t => t.column_id === 'planned');
    const newPosition = plannedTasks.length;
    
    await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ column_id: 'planned', position: newPosition })
    });
    
    task.column_id = 'planned';
    task.position = newPosition;
    
    renderTasks();
    showToast('Task restored to Planned');
  } catch (error) {
    console.error('Error restoring:', error);
  }
}

// Permanently delete task (from archives)
async function permanentDeleteTask(id) {
  const taskEl = document.querySelector(`.task[data-id="${id}"]`);
  if (taskEl) {
    taskEl.style.transform = 'translateX(100%)';
    taskEl.style.opacity = '0';
  }
  
  try {
    await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    tasks = tasks.filter(t => t.id !== id);
    setTimeout(() => renderTasks(), 200);
    showToast('Task permanently deleted');
  } catch (error) {
    console.error('Error deleting:', error);
    renderTasks();
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
// ============ IMAGE PASTE HANDLING ============

// Setup image paste on description textarea
function setupImagePaste() {
  const descTextarea = document.getElementById('taskDesc');
  if (!descTextarea) return;
  
  descTextarea.addEventListener('paste', handleImagePaste);
}

// Initialize image paste when DOM ready
document.addEventListener('DOMContentLoaded', setupImagePaste);

// Handle paste event with image
async function handleImagePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      
      const file = item.getAsFile();
      if (!file) continue;
      
      showToast('Processing image...');
      
      try {
        // Compress and convert to JPEG
        const compressedDataUrl = await compressImage(file);
        
        // Upload to server
        const imageUrl = await uploadImage(compressedDataUrl);
        
        // Insert URL into textarea
        const textarea = document.getElementById('taskDesc');
        const cursorPos = textarea.selectionStart;
        const text = textarea.value;
        const imageMarkdown = `[img:${imageUrl}]`;
        
        textarea.value = text.slice(0, cursorPos) + imageMarkdown + text.slice(cursorPos);
        textarea.selectionStart = textarea.selectionEnd = cursorPos + imageMarkdown.length;
        
        // Show preview
        updateImagePreview();
        showToast('Image added!');
      } catch (error) {
        console.error('Image paste error:', error);
        showToast('Failed to upload image');
      }
      
      break; // Only handle first image
    }
  }
}

// Compress image to JPEG with max dimensions
function compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    
    reader.onload = (e) => {
      img.src = e.target.result;
    };
    
    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }
      
      // Draw to canvas and compress
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl);
    };
    
    img.onerror = () => reject(new Error('Failed to load image'));
    reader.onerror = () => reject(new Error('Failed to read file'));
    
    reader.readAsDataURL(file);
  });
}

// Upload image to server
async function uploadImage(dataUrl) {
  const response = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl })
  });
  
  if (!response.ok) {
    throw new Error('Upload failed');
  }
  
  const data = await response.json();
  return data.url;
}

// Update image preview in modal
function updateImagePreview() {
  const textarea = document.getElementById('taskDesc');
  const previewContainer = document.getElementById('imagePreview');
  if (!previewContainer) return;
  
  const text = textarea.value;
  const imageMatches = text.match(/\[img:([^\]]+)\]/g) || [];
  
  previewContainer.innerHTML = imageMatches.map((match, index) => {
    const url = match.match(/\[img:([^\]]+)\]/)[1];
    return `
      <div class="image-preview-item">
        <img src="${url}" alt="Preview" onclick="openLightbox('${url}')">
        <button class="remove-img" onclick="removeImage(${index})" title="Remove image">&times;</button>
      </div>
    `;
  }).join('');
}

// Remove image from description
function removeImage(index) {
  const textarea = document.getElementById('taskDesc');
  const text = textarea.value;
  const imageMatches = text.match(/\[img:([^\]]+)\]/g) || [];
  
  if (index < imageMatches.length) {
    textarea.value = text.replace(imageMatches[index], '');
    updateImagePreview();
  }
}

// Process description text to render images
function processDescription(text) {
  if (!text) return '';
  
  // Escape HTML first
  let escaped = escapeHtml(text);
  
  // Replace line breaks
  escaped = escaped.replace(/\n/g, '<br>');
  
  // Replace [img:url] with actual img tags
  escaped = escaped.replace(/\[img:([^\]]+)\]/g, (match, url) => {
    return `<img src="${url}" alt="Task image" onclick="openLightbox('${url}')" loading="lazy">`;
  });
  
  return escaped;
}

// Open image in lightbox
function openLightbox(url) {
  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `<img src="${url}" alt="Full size">`;
  lightbox.addEventListener('click', () => lightbox.remove());
  document.body.appendChild(lightbox);
}

// Override modal open to update preview
const originalOpenModal = openModal;
window.openModal = function(columnId, taskId = null) {
  originalOpenModal(columnId, taskId);
  setTimeout(updateImagePreview, 50);
};

// ============ EXTRA COLUMNS (Future Plans & Archives) ============

// Toggle individual column visibility
function toggleColumn(columnId) {
  const board = document.getElementById('board');
  
  if (columnId === 'future-plans') {
    futurePlansVisible = !futurePlansVisible;
    const toggleBtn = document.getElementById('toggleFuturePlans');
    
    if (futurePlansVisible) {
      board.classList.add('show-future-plans');
      toggleBtn.classList.add('active');
    } else {
      board.classList.remove('show-future-plans');
      toggleBtn.classList.remove('active');
    }
    
    localStorage.setItem('futurePlansVisible', futurePlansVisible);
  } 
  else if (columnId === 'archives') {
    archivesVisible = !archivesVisible;
    const toggleBtn = document.getElementById('toggleArchives');
    
    if (archivesVisible) {
      board.classList.add('show-archives');
      toggleBtn.classList.add('active');
    } else {
      board.classList.remove('show-archives');
      toggleBtn.classList.remove('active');
    }
    
    localStorage.setItem('archivesVisible', archivesVisible);
  }
}

// Load column visibility states
function loadColumnStates() {
  const savedFuturePlans = localStorage.getItem('futurePlansVisible');
  const savedArchives = localStorage.getItem('archivesVisible');
  
  if (savedFuturePlans === 'true') {
    futurePlansVisible = false; // Will be toggled to true
    toggleColumn('future-plans');
  }
  
  if (savedArchives === 'true') {
    archivesVisible = false; // Will be toggled to true
    toggleColumn('archives');
  }
}

// Filter archives by search term
function filterArchives() {
  const searchTerm = document.getElementById('archiveSearch').value.toLowerCase();
  const archiveContainer = document.getElementById('archives');
  const archiveTasks = tasks.filter(t => t.column_id === 'archives');
  
  if (!searchTerm) {
    // Show all archived tasks
    if (archiveTasks.length === 0) {
      archiveContainer.innerHTML = '<div class="empty-state">No archived tasks</div>';
    } else {
      archiveContainer.innerHTML = archiveTasks
        .sort((a, b) => a.position - b.position)
        .map(task => createTaskHTML(task, true))
        .join('');
    }
  } else {
    // Filter by search term
    const filtered = archiveTasks.filter(t => 
      t.title.toLowerCase().includes(searchTerm) || 
      (t.description && t.description.toLowerCase().includes(searchTerm))
    );
    
    if (filtered.length === 0) {
      archiveContainer.innerHTML = '<div class="empty-state">No matching tasks</div>';
    } else {
      archiveContainer.innerHTML = filtered
        .sort((a, b) => a.position - b.position)
        .map(task => createTaskHTML(task, true))
        .join('');
    }
  }
  
  // Re-attach drag events
  archiveContainer.querySelectorAll('.task').forEach(taskEl => {
    setupTaskDrag(taskEl);
  });
}

// Delete all archived tasks with confirmation
async function deleteAllArchives() {
  const archiveTasks = tasks.filter(t => t.column_id === 'archives');
  
  if (archiveTasks.length === 0) {
    showToast('No archived tasks to delete');
    return;
  }
  
  // Show confirmation dialog
  const confirmed = confirm(`Are you sure you want to permanently delete ${archiveTasks.length} archived task(s)? This cannot be undone.`);
  
  if (!confirmed) return;
  
  try {
    // Delete all archived tasks
    for (const task of archiveTasks) {
      await fetch(`${API_URL}/${task.id}`, { method: 'DELETE' });
    }
    
    tasks = tasks.filter(t => t.column_id !== 'archives');
    renderTasks();
    showToast(`Deleted ${archiveTasks.length} archived task(s)`);
  } catch (error) {
    console.error('Error deleting archives:', error);
    showToast('Error deleting archives');
    loadTasks(); // Reload to sync state
  }
}