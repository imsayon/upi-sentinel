/**
 * UPI Sentinel Dashboard - Interactive Features
 * Adds animations and simulated real-time updates
 */

document.addEventListener('DOMContentLoaded', async () => {
    // Load real CSV data first
    if (window.dashboardData) {
        await window.dashboardData.loadCSVData();
        // Initialize with real data
        window.dashboardData.initLiveTransactions();
        window.dashboardData.initStateTooltips();
    }

    initVelocityAnimation();
    initSearchFunctionality();
});

/**
 * Simulate live transaction updates
 */
function initTransactionUpdates() {
    const transactionsGrid = document.querySelector('.transactions-grid');
    if (!transactionsGrid) return;

    // Sample transaction data
    const names = ['Sneha', 'Amit', 'Kavya', 'Riya', 'Priya', 'Rahul', 'Aarav', 'Saanvi', 'Arjun', 'Diya'];

    function generateTransaction() {
        const isFlagged = Math.random() < 0.15; // 15% chance of flagged transaction
        const amount = Math.floor(Math.random() * 9000) + 100;
        const txnId = `TXN-${Math.floor(Math.random() * 90000000) + 10000000}`;
        const time = new Date().toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const sender = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 99);
        const receiver = names[Math.floor(Math.random() * names.length)] + Math.floor(Math.random() * 99);

        return {
            txnId,
            time,
            amount: `₹${amount.toLocaleString('en-IN')}`,
            sender,
            receiver,
            isFlagged
        };
    }

    function addTransaction() {
        const txn = generateTransaction();
        const item = document.createElement('div');
        item.className = `transaction-item${txn.isFlagged ? ' flagged' : ''}`;
        item.innerHTML = `
            <div class="txn-left">
                <span class="txn-id">${txn.txnId}</span>
                <span class="txn-time">${txn.time}</span>
            </div>
            <div class="txn-right">
                <span class="txn-amount">${txn.amount}</span>
                <span class="txn-users">${txn.sender} → ${txn.receiver}</span>
            </div>
        `;

        // Add slide-in animation
        item.style.cssText = `
            animation: slideIn 0.3s ease-out;
            opacity: 0;
        `;

        transactionsGrid.insertBefore(item, transactionsGrid.firstChild);

        // Trigger animation
        requestAnimationFrame(() => {
            item.style.opacity = '1';
        });

        // Remove old transactions to prevent overflow (keep 12 for 3x2x2 scroll)
        const items = transactionsGrid.querySelectorAll('.transaction-item:not(.hidden)');
        if (items.length > 12) {
            items[items.length - 1].remove();
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
    `;
    document.head.appendChild(style);

    // Add new transaction every 6 seconds (slower pace)
    setInterval(addTransaction, 6000);
}

/**
 * Search functionality for transactions - searches ALL data
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

    // Create transaction element
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

        const sender = txn.sender_vpa.replace('@upi', '');
        const receiver = txn.receiver_vpa.replace('@upi', '');

        item.innerHTML = `
            <div class="txn-left">
                <span class="txn-id">${txn.txn_id}</span>
                <span class="txn-time">${timeStr}</span>
            </div>
            <div class="txn-right">
                <span class="txn-amount">₹${txn.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                <span class="txn-users">${sender} → ${receiver}</span>
            </div>
        `;
        return item;
    }

    // Search ALL transactions
    function handleSearch() {
        const query = searchInput.value.toLowerCase().trim();

        if (query === '') {
            // Empty search - show live stream items
            const items = transactionsGrid.querySelectorAll('.transaction-item');
            items.forEach(item => item.classList.remove('hidden'));
            return;
        }

        // Search all transaction data
        const allTxns = getAllTransactions();
        const results = allTxns.filter(txn => {
            const txnId = txn.txn_id.toLowerCase();
            const sender = txn.sender_vpa.toLowerCase();
            const receiver = txn.receiver_vpa.toLowerCase();
            const amount = txn.amount.toString();
            const state = txn.state.toLowerCase();

            return txnId.includes(query) ||
                sender.includes(query) ||
                receiver.includes(query) ||
                amount.includes(query) ||
                state.includes(query);
        });

        // Clear and show search results
        transactionsGrid.innerHTML = '';

        if (results.length === 0) {
            transactionsGrid.innerHTML = '<div class="no-results" style="color:#8892A0;padding:20px;text-align:center;grid-column:1/-1;">No transactions found for "' + query + '"</div>';
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

    // Keyboard shortcut (Cmd+K / Ctrl+K)
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }

        // Escape to clear and restore live stream
        if (e.key === 'Escape' && document.activeElement === searchInput) {
            searchInput.value = '';
            restoreLiveStream();
            searchInput.blur();
        }
    });
}

/**
 * Map state tooltips
 */
function initMapTooltips() {
    const states = document.querySelectorAll('.state-region');
    const tooltip = document.getElementById('mapTooltip');

    if (!states.length || !tooltip) return;

    states.forEach(state => {
        state.addEventListener('mouseenter', (e) => {
            const stateName = state.getAttribute('data-name') || state.getAttribute('data-state');
            const fraud = state.getAttribute('data-fraud') || 'No Data';

            // Update tooltip content
            const stateEl = tooltip.querySelector('.tooltip-state');
            const fraudEl = tooltip.querySelector('.tooltip-fraud');

            if (stateEl) stateEl.textContent = stateName;
            if (fraudEl) fraudEl.textContent = fraud === 'No Data' ? 'Fraud: No Data' : `Fraud Rate: ${fraud}`;

            // Show tooltip
            tooltip.style.display = 'block';

            // Position near cursor
            const container = document.querySelector('.map-container');
            const containerRect = container.getBoundingClientRect();
            tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
            tooltip.style.top = (e.clientY - containerRect.top - 40) + 'px';
        });

        state.addEventListener('mousemove', (e) => {
            const container = document.querySelector('.map-container');
            const containerRect = container.getBoundingClientRect();
            tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
            tooltip.style.top = (e.clientY - containerRect.top - 40) + 'px';
        });

        state.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
}

/**
 * Animate velocity chart bars
 */
function initVelocityAnimation() {
    const bars = document.querySelectorAll('.velocity-bar');
    if (!bars.length) return;

    // Randomize bar heights periodically
    function updateBars() {
        bars.forEach(bar => {
            const newHeight = Math.floor(Math.random() * 50) + 30; // 30-80%
            bar.style.setProperty('--height', `${newHeight}%`);
        });
    }

    // Update bars every 5 seconds
    setInterval(updateBars, 5000);
}
