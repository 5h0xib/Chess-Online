// ===== CUSTOMIZABLE GAME LAYOUT MODULE =====

let editMode = false;

document.addEventListener('DOMContentLoaded', () => {
    initLayout();
    
    const editBtn = document.getElementById('editLayoutBtn');
    if (editBtn) {
        editBtn.addEventListener('click', toggleEditMode);
    }
});

function initLayout() {
    const savedOrder = localStorage.getItem('chess_layout_order');
    if (savedOrder) {
        try {
            const orderMap = JSON.parse(savedOrder);
            applyOrder(orderMap);
        } catch (e) {
            console.error('Failed to parse saved layout', e);
        }
    }
    setupDragAndDrop();
}

function applyOrder(orderMap) {
    const cols = document.querySelectorAll('.layout-col');
    cols.forEach(col => {
        const id = col.dataset.col;
        if (orderMap[id] !== undefined) {
            col.style.order = orderMap[id];
        }
    });
}

function toggleEditMode() {
    editMode = !editMode;
    const container = document.getElementById('draggableLayout');
    const cols = document.querySelectorAll('.layout-col');
    const btn = document.getElementById('editLayoutBtn');

    if (!container) return;

    if (editMode) {
        container.classList.add('edit-mode');
        cols.forEach(col => col.setAttribute('draggable', 'true'));
        btn.innerHTML = '<i class="bi bi-check2"></i>';
        if (window.Notifications) {
            Notifications.showToast({ type: 'info', title: 'Edit Mode', message: 'Drag columns to rearrange them.', duration: 3000 });
        }
    } else {
        container.classList.remove('edit-mode');
        cols.forEach(col => col.setAttribute('draggable', 'false'));
        btn.innerHTML = '<i class="bi bi-sliders"></i>';
        saveLayout();
    }
}

function setupDragAndDrop() {
    const cols = document.querySelectorAll('.layout-col');
    let draggedCol = null;

    cols.forEach(col => {
        col.addEventListener('dragstart', function (e) {
            if (!editMode) {
                e.preventDefault();
                return;
            }
            draggedCol = this;
            setTimeout(() => this.classList.add('dragging'), 0);
        });

        col.addEventListener('dragend', function () {
            this.classList.remove('dragging');
            cols.forEach(c => c.classList.remove('drag-over'));
            draggedCol = null;
        });

        col.addEventListener('dragover', function (e) {
            if (!editMode) return;
            e.preventDefault(); // allow drop
            if (this !== draggedCol) {
                this.classList.add('drag-over');
            }
        });

        col.addEventListener('dragleave', function () {
            this.classList.remove('drag-over');
        });

        col.addEventListener('drop', function (e) {
            if (!editMode || this === draggedCol) return;
            e.preventDefault();
            this.classList.remove('drag-over');

            // Swap Flexbox 'order' property
            const targetOrder = window.getComputedStyle(this).order;
            const draggedOrder = window.getComputedStyle(draggedCol).order;

            this.style.order = draggedOrder;
            draggedCol.style.order = targetOrder;
        });
    });
}

function saveLayout() {
    const cols = document.querySelectorAll('.layout-col');
    const orderMap = {};
    cols.forEach(col => {
        const id = col.dataset.col;
        orderMap[id] = window.getComputedStyle(col).order;
    });
    localStorage.setItem('chess_layout_order', JSON.stringify(orderMap));
}
