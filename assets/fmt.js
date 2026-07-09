/** assets/fmt.js - Unified Number and Date Formatting Helpers */

/**
 * Formats a value as Saudi Riyal (SAR) using Western Arabic numerals (0-9) and Arabic currency symbol.
 * @param {number|string} val - The numeric value to format.
 * @param {boolean} [showDecimals=true] - Whether to show decimal points.
 * @returns {string} Formatted currency string.
 */
function fmtSAR(val, showDecimals = true) {
    const num = parseFloat(val);
    if (isNaN(num)) return showDecimals ? '0.00 ر.س' : '0 ر.س';
    const decimals = showDecimals ? 2 : 0;
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ر.س';
}

/**
 * Formats a value as a standard number with thousands separator.
 * @param {number|string} val - The numeric value to format.
 * @param {number} [decimals=0] - Number of decimal places.
 * @returns {string} Formatted number string.
 */
function fmtNum(val, decimals = 0) {
    const num = parseFloat(val);
    if (isNaN(num)) return '0';
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Formats a value as a percentage.
 * @param {number|string} val - The numeric value (e.g. 0.75 or 75 for 75%).
 * @param {number} [decimals=1] - Number of decimal places.
 * @param {boolean} [isFraction=false] - If true, treats 0.75 as 75%. If false, treats 75 as 75%.
 * @returns {string} Formatted percentage string.
 */
function fmtPct(val, decimals = 1, isFraction = false) {
    let num = parseFloat(val);
    if (isNaN(num)) return '0%';
    if (isFraction) num = num * 100;
    return num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

/**
 * Formats a date string (YYYY-MM-DD) into readable Arabic date format (e.g., 9 يوليو 2026).
 * @param {string|Date} dateVal - Date string or Date object.
 * @returns {string} Formatted Arabic date string.
 */
function fmtDate(dateVal) {
    if (!dateVal) return '';
    const date = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
    if (isNaN(date.getTime())) return String(dateVal);
    const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
    return date.getDate() + " " + months[date.getMonth()] + " " + date.getFullYear();
}
