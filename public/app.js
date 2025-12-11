const API_URL = '/api/tasks';

let tasks = [];
let draggedTask = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadTasks();
  setupDragAndDrop();
  setupForm();
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

  // Re-attach drag events to new elements
  document.querySelectorAll('.task').forEach(setupTaskDrag);
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
      ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
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
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  
  if (!draggedTask) return;
  
  const newColumnId = e.currentTarget.id;
  const taskId = parseInt(draggedTask.dataset.id);
  const task = tasks.find(t => t.id === taskId);
  
  if (!task) return;
  
  // Update task column
  task.column_id = newColumnId;
  
  // Reorder tasks in the new column
  const columnTasks = tasks.filter(t => t.column_id === newColumnId);
  columnTasks.forEach((t, idx) => t.position = idx);
  
  // Save to server
  try {
    await fetch(`${API_URL}/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: columnTasks.map(t => ({ id: t.id, column_id: t.column_id, position: t.position })) })
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
