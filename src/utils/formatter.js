// Utility functions for formatting

// Format IDR currency
export function formatIDR(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`;
}

// Short IDR format
export const shortIDR = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

// Truncate text for display
export function truncateText(text = '', maxLength = 28) {
  const str = String(text).trim();
  return str.length > maxLength ? str.slice(0, maxLength - 1) + '…' : str;
}

// Escape HTML for safe display
export const escapeHtml = (text = '') =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Generate order ID
export function generateOrderId(prefix = 'ORD') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

// Format date for Indonesia
export function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}

// Generate slug from name
export function generateSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50);
}
