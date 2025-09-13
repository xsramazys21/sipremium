// Admin Dashboard JavaScript

// Initialize tooltips
document.addEventListener('DOMContentLoaded', function() {
    // Bootstrap tooltip initialization
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
});

// Utility functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    return new Intl.DateTimeFormat('id-ID', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateString));
}

// Alert functions
function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alert-container') || createAlertContainer();
    const alertId = 'alert-' + Date.now();
    
    const alertHTML = `
        <div id="${alertId}" class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.insertAdjacentHTML('beforeend', alertHTML);
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.getElementById(alertId);
        if (alert) {
            const bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        }
    }, 5000);
}

function createAlertContainer() {
    const container = document.createElement('div');
    container.id = 'alert-container';
    container.className = 'fixed-top';
    container.style.zIndex = '9999';
    container.style.top = '20px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.width = '500px';
    container.style.maxWidth = '90%';
    document.body.appendChild(container);
    return container;
}

// Loading states
function showLoading(element) {
    if (element) {
        element.classList.add('loading');
        const originalText = element.textContent;
        element.setAttribute('data-original-text', originalText);
        element.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        element.disabled = true;
    }
}

function hideLoading(element) {
    if (element) {
        element.classList.remove('loading');
        const originalText = element.getAttribute('data-original-text');
        if (originalText) {
            element.textContent = originalText;
        }
        element.disabled = false;
    }
}

// AJAX helpers
async function apiRequest(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };
    
    try {
        const response = await fetch(url, { ...defaultOptions, ...options });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Something went wrong');
        }
        
        return data;
    } catch (error) {
        showAlert(error.message, 'danger');
        throw error;
    }
}

// Product management functions
async function deleteProduct(productId) {
    if (!confirm('Apakah Anda yakin ingin menghapus produk ini?')) {
        return;
    }
    
    try {
        await apiRequest(`/admin/api/products/${productId}`, {
            method: 'DELETE'
        });
        
        showAlert('Produk berhasil dihapus!', 'success');
        location.reload();
    } catch (error) {
        console.error('Error deleting product:', error);
    }
}

async function toggleProductStatus(productId, currentStatus) {
    const newStatus = !currentStatus;
    const action = newStatus ? 'mengaktifkan' : 'menonaktifkan';
    
    if (!confirm(`Apakah Anda yakin ingin ${action} produk ini?`)) {
        return;
    }
    
    try {
        await apiRequest(`/admin/api/products/${productId}/toggle`, {
            method: 'PATCH'
        });
        
        showAlert(`Produk berhasil ${newStatus ? 'diaktifkan' : 'dinonaktifkan'}!`, 'success');
        location.reload();
    } catch (error) {
        console.error('Error toggling product status:', error);
    }
}

// Stock management
async function addStock(productId) {
    const credentialsText = prompt('Masukkan kredensial (satu per baris):');
    if (!credentialsText) return;
    
    const credentials = credentialsText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (credentials.length === 0) {
        showAlert('Tidak ada kredensial yang valid!', 'warning');
        return;
    }
    
    try {
        await apiRequest(`/admin/api/products/${productId}/stock`, {
            method: 'POST',
            body: JSON.stringify({ credentials })
        });
        
        showAlert(`${credentials.length} kredensial berhasil ditambahkan!`, 'success');
        location.reload();
    } catch (error) {
        console.error('Error adding stock:', error);
    }
}

// Form validation
function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;
    
    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('is-invalid');
            isValid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });
    
    return isValid;
}

// Initialize data tables if DataTables is loaded
document.addEventListener('DOMContentLoaded', function() {
    if (typeof DataTable !== 'undefined') {
        const tables = document.querySelectorAll('.data-table');
        tables.forEach(table => {
            new DataTable(table, {
                language: {
                    url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/id.json'
                },
                pageLength: 25,
                responsive: true
            });
        });
    }
});

// Real-time updates (if WebSocket is implemented)
function initializeRealTimeUpdates() {
    // Placeholder for WebSocket implementation
    // This can be extended to show real-time order updates
}

// Export functions for global access
window.adminDashboard = {
    showAlert,
    formatCurrency,
    formatDate,
    deleteProduct,
    toggleProductStatus,
    addStock,
    validateForm,
    apiRequest
};
