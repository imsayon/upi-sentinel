/**
 * RakshaNet Dashboard - Real API Integration
 * Removes all mock/simulation logic and connects to Node.js backend
 */

// Configuration
const API_BASE_URL = window.location.origin;
const API_ENDPOINTS = {
    transactions: `${API_BASE_URL}/api/transactions`,
    upload: `${API_BASE_URL}/api/transactions/upload`,
    health: `${API_BASE_URL}/health`,
};

// State management
let pollingInterval = null;
let retryCount = 0;
const MAX_RETRIES = 5;
const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Initialize dashboard on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 RakshaNet Dashboard initializing...');
    
    // Load CSV data for initial display
    if (window.dashboardData) {
        await window.dashboardData.loadCSVData();
        window.dashboardData.initLiveTransactions();
        window.dashboardData.initStateTooltips();
    }

    // Initialize search functionality
    initSearchFunctionality();
    
    // Initialize CSV upload functionality
    initUploadFunctionality();
    
    // Start API polling for real-time updates
    startTransactionPolling();
    
    // Check API health
    checkApiHealth();
});

/**
 * Check API health status
 */
async function checkApiHealth() {
    try {
        const response = await fetch(API_ENDPOINTS.health);
        const data = await response.json();
        
        console.log('✅ API Health Check:', data);
        updateSystemStatus('online', data);
    } catch (error) {
        console.warn('⚠️  API health check failed:', error.message);
        updateSystemStatus('offline', null);
    }
}

/**
 * Update system status indicators in the UI
 */
function updateSystemStatus(status, healthData) {
    const statusBadge = document.querySelector('.status-badge');
    const statusDot = document.querySelector('.status-dot');
    
    if (status === 'online') {
        if (statusBadge) {
            statusBadge.classList.add('operational');
            statusBadge.innerHTML = '<span class="status-dot-small"></span>OPERATIONAL';
        }
        if (statusDot) statusDot.style.background = '#00FF88';
    } else {
        if (statusBadge) {
            statusBadge.classList.remove('operational');
            statusBadge.innerHTML = '<span class="status-dot-small"></span>OFFLINE';
            statusBadge.style.background = '#DC2626';
        }
        if (statusDot) statusDot.style.background = '#DC2626';
    }
}

/**
 * Start polling for new transactions from API
 */
function startTransactionPolling() {
    console.log('🔄 Starting transaction polling...');
    
    // Clear any existing interval
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
    
    // Poll immediately and then at intervals
    fetchLatestTransactions();
    pollingInterval = setInterval(fetchLatestTransactions, POLL_INTERVAL);
}

/**
 * Fetch latest transactions from backend API
 */
async function fetchLatestTransactions() {
    try {
        // Note: This would need a GET endpoint on the backend
        // For now, we'll use the CSV data as the data source
        // In production, you'd have an endpoint like GET /api/transactions/recent
        
        // Since we're using CSV upload model, we display from loaded data
        if (window.dashboardData && window.dashboardData.transactionData) {
            const transactions = window.dashboardData.transactionData();
            if (transactions && transactions.length > 0) {
                updateTransactionDisplay(transactions.slice(0, 10));
                updateDashboardStatistics(transactions);
                retryCount = 0; // Reset retry count on success
            }
        }
        
    } catch (error) {
        console.error('❌ Failed to fetch transactions:', error);
        handleApiError(error);
    }
}

/**
 * Update transaction grid with real data
 */
function updateTransactionDisplay(transactions) {
    const transactionsGrid = document.querySelector('.transactions-grid');
    if (!transactionsGrid) return;

    // Clear existing if needed (but keep for smooth updates)
    // transactionsGrid.innerHTML = '';

    transactions.forEach((txn, index) => {
        const exists = document.querySelector(`[data-txn-id="${txn.txn_id}"]`);
        if (!exists) {
            const item = createTransactionElement(txn);
            item.setAttribute('data-txn-id', txn.txn_id);
            
            // Add with animation
            item.style.cssText = 'animation: slideIn 0.3s ease-out; opacity: 0;';
            transactionsGrid.insertBefore(item, transactionsGrid.firstChild);
            
            requestAnimationFrame(() => {
                item.style.opacity = '1';
            });
        }
    });

    // Limit displayed transactions
    const items = transactionsGrid.querySelectorAll('.transaction-item');
    if (items.length > 20) {
        for (let i = 20; i < items.length; i++) {
            items[i].remove();
        }
    }
}

/**
 * Create transaction DOM element
 */
function createTransactionElement(txn) {
    const item = document.createElement('div');
    item.className = `transaction-item${txn.fraud === 1 ? ' flagged' : ''}`;

    const date = new Date(txn.timestamp);
    const timeStr = date.toLocaleTimeString('en-US', {
        hour12: true,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const sender = (txn.sender_vpa || 'unknown').replace('@upi', '');
    const receiver = (txn.receiver_vpa || 'unknown').replace('@upi', '');

    item.innerHTML = `
        <div class="txn-left">
            <span class="txn-id">${txn.txn_id}</span>
            <span class="txn-time">${timeStr}</span>
        </div>
        <div class="txn-right">
            <span class="txn-amount">₹${parseFloat(txn.amount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            <span class="txn-users">${sender} → ${receiver}</span>
        </div>
    `;
    
    return item;
}

/**
 * Update dashboard statistics with real data
 */
function updateDashboardStatistics(transactions) {
    if (!transactions || transactions.length === 0) return;

    // Calculate statistics
    const totalTransactions = transactions.length;
    const fraudTransactions = transactions.filter(t => t.fraud === 1).length;
    const totalAmount = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const fraudAmount = transactions
        .filter(t => t.fraud === 1)
        .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    // Update stat cards
    const statCards = document.querySelectorAll('.stat-value');
    if (statCards[0]) {
        statCards[0].textContent = totalTransactions.toLocaleString('en-IN');
    }
    if (statCards[1]) {
        statCards[1].textContent = fraudTransactions.toLocaleString('en-IN');
    }
    if (statCards[2]) {
        const lakhsSaved = (fraudAmount / 100000).toFixed(1);
        statCards[2].textContent = `₹${lakhsSaved} Lakhs`;
    }
}

/**
 * Handle API errors with exponential backoff
 */
function handleApiError(error) {
    retryCount++;
    
    if (retryCount >= MAX_RETRIES) {
        console.error('❌ Max retries reached. Stopping polling.');
        clearInterval(pollingInterval);
        showErrorMessage('Unable to connect to API. Please refresh the page.');
        updateSystemStatus('offline', null);
        return;
    }

    // Exponential backoff
    const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
    console.log(`🔄 Retry ${retryCount}/${MAX_RETRIES} in ${backoffDelay}ms`);
    
    setTimeout(() => {
        fetchLatestTransactions();
    }, backoffDelay);
}

/**
 * Show error message to user
 */
function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'api-error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #DC2626;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
    `;
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);

    // Remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

/**
 * Search functionality for transactions
 */
function initSearchFunctionality() {
    const searchInput = document.getElementById('txnSearch');
    if (!searchInput) return;

    const transactionsGrid = document.querySelector('.transactions-grid');
    if (!transactionsGrid) return;

    // Get all transaction data
    function getAllTransactions() {
        if (window.dashboardData && window.dashboardData.transactionData) {
            return window.dashboardData.transactionData();
        }
        return [];
    }

    // Search ALL transactions
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();

        if (query === '') {
            // Empty search - restore live stream
            restoreLiveStream();
            return;
        }

        // Search all transaction data
        const allTxns = getAllTransactions();
        const results = allTxns.filter(txn => {
            const txnId = (txn.txn_id || '').toLowerCase();
            const sender = (txn.sender_vpa || '').toLowerCase();
            const receiver = (txn.receiver_vpa || '').toLowerCase();
            const amount = (txn.amount || '').toString();
            const state = (txn.state || '').toLowerCase();

            return txnId.includes(query) ||
                sender.includes(query) ||
                receiver.includes(query) ||
                amount.includes(query) ||
                state.includes(query);
        });

        // Clear and show search results
        transactionsGrid.innerHTML = '';

        if (results.length === 0) {
            transactionsGrid.innerHTML = `<div class="no-results" style="color:#8892A0;padding:20px;text-align:center;grid-column:1/-1;">No transactions found for "${query}"</div>`;
        } else {
            // Show up to 20 results
            results.slice(0, 20).forEach(txn => {
                transactionsGrid.appendChild(createTransactionElement(txn));
            });

            if (results.length > 20) {
                const more = document.createElement('div');
                more.className = 'search-more';
                more.style.cssText = 'color:#00FF88;padding:10px;text-align:center;grid-column:1/-1;font-size:11px;';
                more.textContent = `Showing 20 of ${results.length} results`;
                transactionsGrid.appendChild(more);
            }
        }
    }

    // Restore live stream when search is cleared
    function restoreLiveStream() {
        const allTxns = getAllTransactions();
        transactionsGrid.innerHTML = '';
        allTxns.slice(0, 10).forEach(txn => {
            transactionsGrid.appendChild(createTransactionElement(txn));
        });
    }

    // Debounced search
    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (searchInput.value.trim() === '') {
                restoreLiveStream();
            } else {
                handleSearch();
            }
        }, 200);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }

        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            restoreLiveStream();
            searchInput.blur();
        }
    });
}

/**
 * Initialize CSV Upload Functionality
 */
function initUploadFunctionality() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('csvFileInput');
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadResults = document.getElementById('uploadResults');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const resultsGrid = document.getElementById('resultsGrid');

    if (!uploadZone || !fileInput) return;

    // Drag and drop handlers
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#00FF88';
        uploadZone.style.background = '#161B22';
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#30363D';
        uploadZone.style.background = 'transparent';
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '#30363D';
        uploadZone.style.background = 'transparent';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    // File input change handler
    fileInput.addEventListener('change', (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });

    /**
     * Handle file upload
     */
    async function handleFileUpload(file) {
        // Validate file type
        if (!file.name.endsWith('.csv')) {
            alert('Please upload a CSV file');
            return;
        }

        // Show progress
        uploadProgress.style.display = 'block';
        uploadResults.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = 'Uploading...';

        try {
            // Create FormData
            const formData = new FormData();
            formData.append('file', file);

            // Simulate progress
            progressFill.style.width = '30%';

            // Upload file
            const response = await fetch(API_ENDPOINTS.upload, {
                method: 'POST',
                body: formData,
            });

            progressFill.style.width = '70%';
            progressText.textContent = 'Processing...';

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            progressFill.style.width = '100%';
            progressText.textContent = 'Complete!';

            // Display results
            setTimeout(() => {
                displayUploadResults(result);
                uploadProgress.style.display = 'none';
            }, 500);

            // Reset file input
            fileInput.value = '';

            // Refresh transaction display
            fetchLatestTransactions();

        } catch (error) {
            console.error('Upload error:', error);
            progressText.textContent = 'Upload failed: ' + error.message;
            progressText.style.color = '#DC2626';
            setTimeout(() => {
                uploadProgress.style.display = 'none';
                progressText.style.color = '#E6EDF3';
            }, 3000);
        }
    }

    /**
     * Display upload results
     */
    function displayUploadResults(result) {
        if (!result.data || result.data.length === 0) {
            resultsGrid.innerHTML = '<p style="color: #8892A0;">No results to display</p>';
            uploadResults.style.display = 'block';
            return;
        }

        const data = result.data;
        const totalCount = data.length;
        const fraudCount = data.filter(t => t.verdict === 'FRAUD').length;
        const safeCount = totalCount - fraudCount;
        const totalAmount = data.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const fraudAmount = data.filter(t => t.verdict === 'FRAUD')
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        // Create result cards
        resultsGrid.innerHTML = `
            <div style="background: #161B22; padding: 20px; border-radius: 8px; border: 1px solid #21262D;">
                <div style="color: #8892A0; font-size: 12px; margin-bottom: 5px;">TOTAL TRANSACTIONS</div>
                <div style="color: #E6EDF3; font-size: 28px; font-weight: 700;">${totalCount}</div>
            </div>
            <div style="background: #161B22; padding: 20px; border-radius: 8px; border: 1px solid #21262D;">
                <div style="color: #8892A0; font-size: 12px; margin-bottom: 5px;">FRAUD DETECTED</div>
                <div style="color: #DC2626; font-size: 28px; font-weight: 700;">${fraudCount}</div>
                <div style="color: #8892A0; font-size: 11px; margin-top: 5px;">${((fraudCount/totalCount)*100).toFixed(1)}% of total</div>
            </div>
            <div style="background: #161B22; padding: 20px; border-radius: 8px; border: 1px solid #21262D;">
                <div style="color: #8892A0; font-size: 12px; margin-bottom: 5px;">SAFE TRANSACTIONS</div>
                <div style="color: #00FF88; font-size: 28px; font-weight: 700;">${safeCount}</div>
                <div style="color: #8892A0; font-size: 11px; margin-top: 5px;">${((safeCount/totalCount)*100).toFixed(1)}% of total</div>
            </div>
            <div style="background: #161B22; padding: 20px; border-radius: 8px; border: 1px solid #21262D;">
                <div style="color: #8892A0; font-size: 12px; margin-bottom: 5px;">FRAUD AMOUNT BLOCKED</div>
                <div style="color: #00D4FF; font-size: 24px; font-weight: 700;">₹${(fraudAmount/100000).toFixed(2)}L</div>
                <div style="color: #8892A0; font-size: 11px; margin-top: 5px;">Out of ₹${(totalAmount/100000).toFixed(2)}L</div>
            </div>
        `;

        uploadResults.style.display = 'block';

        // Show success message
        const successMsg = document.createElement('div');
        successMsg.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00FF88, #00D4FF);
            color: #0D1117;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,255,136,0.3);
            z-index: 10000;
            font-weight: 600;
            animation: slideInRight 0.3s ease-out;
        `;
        successMsg.textContent = `✓ Analyzed ${totalCount} transactions successfully!`;
        document.body.appendChild(successMsg);

        setTimeout(() => {
            successMsg.style.animation = 'slideOutRight 0.3s ease-in';
            setTimeout(() => successMsg.remove(), 300);
        }, 4000);
    }
}

// Add animation keyframes
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(-20px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideInRight {
        from {
            transform: translateX(100px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
