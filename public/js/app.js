/**
 * Nirmana Printing Management System — Client Script & Serene UI System
 * Notion/Linear Calm Edition Toast Notifications and Modal Dialogs
 */

// Helper to escape HTML in messages
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 1. Serene Toast Notification System
 * Displays floating, non-blocking toast notifications
 */
window.showToast = function(message, type = 'success', duration = 3500) {
  let container = document.getElementById('sereneToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sereneToastContainer';
    container.className = 'serene-toast-container';
    document.body.appendChild(container);
  }

  const toastEl = document.createElement('div');
  toastEl.className = `serene-toast toast-${type}`;

  let iconHtml = '<i class="bi bi-check-circle-fill"></i>';
  let defaultTitle = 'Success';
  if (type === 'error') {
    iconHtml = '<i class="bi bi-x-circle-fill"></i>';
    defaultTitle = 'Action Failed';
  } else if (type === 'warning') {
    iconHtml = '<i class="bi bi-exclamation-triangle-fill"></i>';
    defaultTitle = 'Notice';
  } else if (type === 'info') {
    iconHtml = '<i class="bi bi-info-circle-fill"></i>';
    defaultTitle = 'Information';
  }

  toastEl.innerHTML = `
    <div class="serene-toast-icon">${iconHtml}</div>
    <div class="serene-toast-content">
      <div class="serene-toast-title">${defaultTitle}</div>
      <div class="serene-toast-message">${escapeHtml(message)}</div>
    </div>
    <button type="button" class="serene-toast-close" aria-label="Close">&times;</button>
    <div class="serene-toast-progress">
      <div class="serene-toast-progress-bar" style="animation-duration: ${duration}ms;"></div>
    </div>
  `;

  container.appendChild(toastEl);

  // Trigger smooth enter animation
  requestAnimationFrame(() => {
    toastEl.classList.add('show');
  });

  const dismiss = () => {
    toastEl.classList.remove('show');
    toastEl.classList.add('hiding');
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 280);
  };

  const closeBtn = toastEl.querySelector('.serene-toast-close');
  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  return toastEl;
};

// Shorthand toast API
window.toast = {
  success: (msg, dur) => window.showToast(msg, 'success', dur),
  error: (msg, dur) => window.showToast(msg, 'error', dur),
  warning: (msg, dur) => window.showToast(msg, 'warning', dur),
  info: (msg, dur) => window.showToast(msg, 'info', dur),
};

// Persist toast across page reloads or redirects
window.setPendingToast = function(message, type = 'success') {
  try {
    sessionStorage.setItem('serene_pending_toast', JSON.stringify({ message, type }));
  } catch (e) {
    console.error('Failed to set pending toast:', e);
  }
};

/**
 * 2. Serene Confirm Dialog (Replaces native confirm())
 * Returns a Promise<boolean>
 */
window.sereneConfirm = function({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false
} = {}) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('sereneDialogModal');
    if (!modalEl || typeof bootstrap === 'undefined') {
      resolve(window.confirm(message.replace(/<[^>]*>?/gm, '')));
      return;
    }

    const titleEl = document.getElementById('sereneDialogTitle');
    const msgEl = document.getElementById('sereneDialogMessage');
    const inputContainer = document.getElementById('sereneDialogInputContainer');
    const confirmBtn = document.getElementById('sereneDialogConfirmBtn');
    const cancelBtn = document.getElementById('sereneDialogCancelBtn');

    titleEl.textContent = title;
    msgEl.innerHTML = message;
    inputContainer.style.display = 'none';

    confirmBtn.textContent = confirmText;
    confirmBtn.className = isDestructive ? 'btn btn-danger btn-sm' : 'btn btn-serene-primary btn-sm';
    cancelBtn.textContent = cancelText;

    const bsModal = new bootstrap.Modal(modalEl);
    let resolved = false;

    const onConfirm = () => {
      resolved = true;
      bsModal.hide();
      resolve(true);
    };

    const onHidden = () => {
      confirmBtn.removeEventListener('click', onConfirm);
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
      if (!resolved) resolve(false);
    };

    confirmBtn.addEventListener('click', onConfirm);
    modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });

    bsModal.show();
  });
};

/**
 * 3. Serene Prompt Dialog (Replaces native prompt())
 * Returns a Promise<string | null>
 */
window.serenePrompt = function({
  title = 'Input Required',
  message = '',
  label = '',
  defaultValue = '',
  placeholder = '',
  type = 'text',
  min,
  max,
  step,
  confirmText = 'Confirm',
  cancelText = 'Cancel'
} = {}) {
  return new Promise((resolve) => {
    const modalEl = document.getElementById('sereneDialogModal');
    if (!modalEl || typeof bootstrap === 'undefined') {
      resolve(window.prompt(message.replace(/<[^>]*>?/gm, ''), defaultValue));
      return;
    }

    const titleEl = document.getElementById('sereneDialogTitle');
    const msgEl = document.getElementById('sereneDialogMessage');
    const inputContainer = document.getElementById('sereneDialogInputContainer');
    const inputLabel = document.getElementById('sereneDialogInputLabel');
    const inputEl = document.getElementById('sereneDialogInput');
    const confirmBtn = document.getElementById('sereneDialogConfirmBtn');
    const cancelBtn = document.getElementById('sereneDialogCancelBtn');

    titleEl.textContent = title;
    msgEl.innerHTML = message;
    inputContainer.style.display = 'block';

    inputLabel.textContent = label || '';
    inputLabel.style.display = label ? 'block' : 'none';

    inputEl.type = type;
    inputEl.value = defaultValue !== undefined ? defaultValue : '';
    inputEl.placeholder = placeholder || '';

    if (min !== undefined) inputEl.min = min; else inputEl.removeAttribute('min');
    if (max !== undefined) inputEl.max = max; else inputEl.removeAttribute('max');
    if (step !== undefined) inputEl.step = step; else inputEl.removeAttribute('step');

    confirmBtn.textContent = confirmText;
    confirmBtn.className = 'btn btn-serene-primary btn-sm';
    cancelBtn.textContent = cancelText;

    const bsModal = new bootstrap.Modal(modalEl);
    let resolved = false;

    const submitValue = () => {
      resolved = true;
      const val = inputEl.value;
      bsModal.hide();
      resolve(val);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitValue();
      }
    };

    const onShown = () => {
      inputEl.focus();
      inputEl.select();
    };

    const onHidden = () => {
      confirmBtn.removeEventListener('click', submitValue);
      inputEl.removeEventListener('keydown', onKeyDown);
      modalEl.removeEventListener('shown.bs.modal', onShown);
      modalEl.removeEventListener('hidden.bs.modal', onHidden);
      if (!resolved) resolve(null);
    };

    confirmBtn.addEventListener('click', submitValue);
    inputEl.addEventListener('keydown', onKeyDown);
    modalEl.addEventListener('shown.bs.modal', onShown, { once: true });
    modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });

    bsModal.show();
  });
};

// Override native window.alert as fallback so no ugly popups leak through
window.alert = function(msg) {
  if (typeof window.showToast === 'function') {
    window.showToast(msg, 'info');
  } else {
    console.log('[Alert]', msg);
  }
};

/**
 * DOM Ready Initializations
 */
function initSereneApp() {
  // A. Check and display any pending toast from previous page action / redirect
  try {
    const pending = sessionStorage.getItem('serene_pending_toast');
    if (pending) {
      sessionStorage.removeItem('serene_pending_toast');
      const { message, type } = JSON.parse(pending);
      if (message) {
        setTimeout(() => {
          window.showToast(message, type || 'success');
        }, 150);
      }
    }
  } catch (e) {
    console.error('Error displaying pending toast:', e);
  }

  // B. Mobile Sidebar Drawer Toggle & Interactions
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarClose = document.getElementById('sidebarClose');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const sidebar = document.querySelector('.sidebar');

  function openSidebar() {
    if (sidebar) sidebar.classList.add('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarBackdrop) sidebarBackdrop.classList.remove('show');
    document.body.style.overflow = '';
  }

  if (sidebarToggle && !sidebarToggle.dataset.bound) {
    sidebarToggle.dataset.bound = 'true';
    sidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sidebar && sidebar.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });
  }

  if (sidebarClose && !sidebarClose.dataset.bound) {
    sidebarClose.dataset.bound = 'true';
    sidebarClose.addEventListener('click', closeSidebar);
  }

  if (sidebarBackdrop && !sidebarBackdrop.dataset.bound) {
    sidebarBackdrop.dataset.bound = 'true';
    sidebarBackdrop.addEventListener('click', closeSidebar);
  }

  if (sidebar) {
    sidebar.querySelectorAll('.nav-item-link').forEach(link => {
      if (!link.dataset.bound) {
        link.dataset.bound = 'true';
        link.addEventListener('click', () => {
          if (window.innerWidth < 992) {
            closeSidebar();
          }
        });
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
      closeSidebar();
    }
  });

  // C. Format Currency helper
  window.formatCurrency = (amount) => {
    return 'Rs. ' + parseFloat(amount || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // D. Quick Order Status Update helper
  window.updateOrderStatus = async function(orderId, newStatus) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        window.setPendingToast(`Order #${orderId} status updated to ${newStatus}`, 'success');
        if (window.Turbo) {
          window.Turbo.visit(window.location.href);
        } else {
          window.location.reload();
        }
      } else {
        window.toast.error('Status transition failed: ' + data.message);
      }
    } catch (err) {
      window.toast.error('Error updating status: ' + err.message);
    }
  };

  // E. Quick Record Payment modal submission
  const paymentForm = document.getElementById('quickPaymentForm');
  if (paymentForm && !paymentForm.dataset.bound) {
    paymentForm.dataset.bound = 'true';
    paymentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const orderId = document.getElementById('paymentOrderId').value;
      const amount = document.getElementById('paymentAmount').value;
      const paymentMethod = document.getElementById('paymentMethod').value;
      const referenceNumber = document.getElementById('paymentReference').value;
      const notes = document.getElementById('paymentNotes').value;

      try {
        const res = await fetch(`/api/orders/${orderId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount, paymentMethod, referenceNumber, notes }),
        });
        const data = await res.json();
        if (data.success) {
          window.setPendingToast('Payment recorded successfully!', 'success');
          if (window.Turbo) {
            window.Turbo.visit(window.location.href);
          } else {
            window.location.reload();
          }
        } else {
          window.toast.error('Payment failed: ' + data.message);
        }
      } catch (err) {
        window.toast.error('Network error: ' + err.message);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', initSereneApp);
document.addEventListener('turbo:load', initSereneApp);
