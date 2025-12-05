/**
 * UPI Sentinel Dashboard - Data Loader
 * Loads and processes real transaction data from embedded JS
 */

let transactionData = [];
let stateStats = {};
let dashboardStats = {
    totalTransactions: 0,
    fraudIntercepted: 0,
    totalAmount: 0,
    fraudAmount: 0
};

/**
 * Load data from embedded TRANSACTION_DATA array
 */
async function loadCSVData() {
    // Use the embedded data from transaction-data.js
    if (typeof TRANSACTION_DATA !== 'undefined') {
        processTransactionData(TRANSACTION_DATA);
        updateDashboard();
        console.log('Loaded', transactionData.length, 'transactions from embedded data');
    } else {
        console.error('TRANSACTION_DATA not found!');
    }
}

/**
 * Process transaction array into statistics
 */
function processTransactionData(data) {
    transactionData = [];
    stateStats = {};
    dashboardStats = {
        totalTransactions: 0,
        fraudIntercepted: 0,
        totalAmount: 0,
        fraudAmount: 0
    };

    data.forEach(txn => {
        transactionData.push(txn);

        // Update dashboard stats
        dashboardStats.totalTransactions++;
        dashboardStats.totalAmount += txn.amount;

        if (txn.fraud === 1) {
            dashboardStats.fraudIntercepted++;
            dashboardStats.fraudAmount += txn.amount;
        }

        // Update state stats
        const state = txn.state;
        if (!stateStats[state]) {
            stateStats[state] = {
                transactions: 0,
                fraudCount: 0,
                totalAmount: 0,
                fraudAmount: 0,
                qrFraud: 0,
                muleFraud: 0,
                coercionFraud: 0
            };
        }
        stateStats[state].transactions++;
        stateStats[state].totalAmount += txn.amount;
        if (txn.fraud === 1) {
            stateStats[state].fraudCount++;
            stateStats[state].fraudAmount += txn.amount;
        }
        if (txn.qr_fraud === 1) stateStats[state].qrFraud++;
        if (txn.mule_fraud === 1) stateStats[state].muleFraud++;
        if (txn.coercion_fraud === 1) stateStats[state].coercionFraud++;
    });

    // Sort transactions by timestamp (newest first)
    transactionData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Add placeholder data for states not in CSV
    const placeholderStates = {
        'Punjab': { transactions: 28, fraudCount: 4, totalAmount: 180000, fraudAmount: 25000 },
        'Rajasthan': { transactions: 42, fraudCount: 8, totalAmount: 320000, fraudAmount: 55000 },
        'Bihar': { transactions: 35, fraudCount: 6, totalAmount: 220000, fraudAmount: 38000 },
        'West Bengal': { transactions: 52, fraudCount: 14, totalAmount: 410000, fraudAmount: 95000 },
        'Jharkhand': { transactions: 25, fraudCount: 5, totalAmount: 155000, fraudAmount: 32000 },
        'Madhya Pradesh': { transactions: 38, fraudCount: 7, totalAmount: 275000, fraudAmount: 48000 },
        'Chhattisgarh': { transactions: 22, fraudCount: 4, totalAmount: 140000, fraudAmount: 28000 },
        'Odisha': { transactions: 31, fraudCount: 6, totalAmount: 195000, fraudAmount: 42000 },
        'Andhra Pradesh': { transactions: 45, fraudCount: 9, totalAmount: 350000, fraudAmount: 62000 },
        'Kerala': { transactions: 33, fraudCount: 5, totalAmount: 260000, fraudAmount: 35000 },
        'Jammu & Kashmir': { transactions: 18, fraudCount: 3, totalAmount: 120000, fraudAmount: 22000 }
    };

    Object.keys(placeholderStates).forEach(state => {
        if (!stateStats[state]) {
            stateStats[state] = {
                ...placeholderStates[state],
                qrFraud: Math.floor(placeholderStates[state].fraudCount * 0.4),
                muleFraud: Math.floor(placeholderStates[state].fraudCount * 0.3),
                coercionFraud: Math.floor(placeholderStates[state].fraudCount * 0.3)
            };
        }
    });
}

/**
 * Update all dashboard components with real data
 */
function updateDashboard() {
    updateStatCards();
    updateStateMap();
    updateTransactionList();
    updateMapStats();
}

/**
 * Update stat cards with real data
 */
function updateStatCards() {
    const statCards = document.querySelectorAll('.stat-card');

    // Transactions (24H)
    const txnValue = statCards[0]?.querySelector('.stat-value');
    if (txnValue) {
        txnValue.textContent = dashboardStats.totalTransactions.toLocaleString('en-IN');
    }

    // Fraud Intercepted
    const fraudValue = statCards[1]?.querySelector('.stat-value');
    if (fraudValue) {
        fraudValue.textContent = dashboardStats.fraudIntercepted.toLocaleString('en-IN');
    }

    // Est. Loss Prevented (fraud amount)
    const lossValue = statCards[2]?.querySelector('.stat-value');
    if (lossValue) {
        const lakhAmount = (dashboardStats.fraudAmount / 100000).toFixed(1);
        lossValue.textContent = `₹${lakhAmount} Lakhs`;
    }

    // Update fraud percentage
    const fraudPercent = ((dashboardStats.fraudIntercepted / dashboardStats.totalTransactions) * 100).toFixed(1);
    const fraudSubtext = statCards[1]?.querySelector('.stat-subtext');
    if (fraudSubtext) {
        fraudSubtext.textContent = `${fraudPercent}% fraud detection rate`;
    }
}

/**
 * Update state map colors based on fraud levels
 */
function updateStateMap() {
    // Map SVG data-state (Keys) to CSV State Names (Values)
    const svgToDataMap = {
        'HR': 'Haryana',
        'MH': 'Maharashtra',
        'GJ': 'Gujarat',
        'TN': 'Tamil Nadu',
        'TS': 'Telangana',
        'UP': 'UP',
        'DL': 'Delhi',
        'KA': 'Karnataka',
        'PB': 'Punjab',
        'RJ': 'Rajasthan',
        'BR': 'Bihar',
        'WB': 'West Bengal',
        'JH': 'Jharkhand',
        'MP': 'Madhya Pradesh',
        'CG': 'Chhattisgarh',
        'OD': 'Odisha',
        'AP': 'Andhra Pradesh',
        'KL': 'Kerala',
        'J&K': 'Jammu & Kashmir',
        'NE': 'North East'
    };

    // Calculate fraud rate for each state
    const stateRisks = {};
    Object.keys(stateStats).forEach(state => {
        const stats = stateStats[state];
        const fraudRate = (stats.fraudCount / stats.transactions) * 100;
        stateRisks[state] = {
            fraudRate,
            level: fraudRate > 30 ? 'High' : fraudRate > 15 ? 'Medium' : 'Low',
            fraudCount: stats.fraudCount,
            transactions: stats.transactions
        };
    });

    // Update map data attributes
    document.querySelectorAll('.state-region').forEach(stateEl => {
        const svgCode = stateEl.getAttribute('data-state');

        // 1. Try to find full name from map
        let dataName = svgToDataMap[svgCode];

        // 2. Fallback: If not found, maybe the SVG code IS the data name (e.g. "UP")
        if (!dataName && stateStats[svgCode]) {
            dataName = svgCode;
        }

        // If we found a matching state in our stats
        if (dataName && stateRisks[dataName]) {
            const risk = stateRisks[dataName];
            stateEl.setAttribute('data-fraud', risk.fraudCount);
            stateEl.setAttribute('data-level', risk.level);
            stateEl.setAttribute('data-transactions', risk.transactions);

            // Update CSS class
            stateEl.classList.remove('low', 'medium', 'high');
            stateEl.classList.add(risk.level.toLowerCase());
        }
    });
}

/**
 * Update transaction list with real data
 */
function updateTransactionList() {
    const transactionsGrid = document.querySelector('.transactions-grid');
    if (!transactionsGrid) return;

    // Clear existing transactions
    transactionsGrid.innerHTML = '';

    // Add real transactions (first 10)
    const displayTransactions = transactionData.slice(0, 10);

    displayTransactions.forEach(txn => {
        const item = document.createElement('div');
        item.className = `transaction-item${txn.fraud === 1 ? ' flagged' : ''}`;

        // Format timestamp
        const date = new Date(txn.timestamp);
        const timeStr = date.toLocaleTimeString('en-US', {
            hour12: true,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // Format sender and receiver
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

        transactionsGrid.appendChild(item);
    });
}

/**
 * Update map stats summary
 */
function updateMapStats() {
    const mapStats = document.querySelectorAll('.map-stat');

    // Count states by risk level
    let lowRisk = 0, mediumRisk = 0, highRisk = 0;

    Object.keys(stateStats).forEach(state => {
        const stats = stateStats[state];
        const fraudRate = (stats.fraudCount / stats.transactions) * 100;
        if (fraudRate > 30) highRisk++;
        else if (fraudRate > 15) mediumRisk++;
        else lowRisk++;
    });

    // Update display
    if (mapStats[0]) {
        mapStats[0].querySelector('.map-stat-value').textContent = lowRisk;
    }
    if (mapStats[1]) {
        mapStats[1].querySelector('.map-stat-value').textContent = mediumRisk;
    }
    if (mapStats[2]) {
        mapStats[2].querySelector('.map-stat-value').textContent = highRisk;
    }
}

/**
 * Live transaction simulation using real data pool
 */
function initLiveTransactions() {
    const transactionsGrid = document.querySelector('.transactions-grid');
    if (!transactionsGrid || transactionData.length === 0) return;

    let txnIndex = 10; // Start after initial display

    function addNextTransaction() {
        if (txnIndex >= transactionData.length) {
            txnIndex = 0; // Loop back
        }

        const txn = transactionData[txnIndex++];
        const item = document.createElement('div');
        item.className = `transaction-item${txn.fraud === 1 ? ' flagged' : ''}`;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', {
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

        item.style.cssText = 'animation: slideIn 0.3s ease-out; opacity: 0;';
        transactionsGrid.insertBefore(item, transactionsGrid.firstChild);

        requestAnimationFrame(() => {
            item.style.opacity = '1';
        });

        // Remove old transactions
        const items = transactionsGrid.querySelectorAll('.transaction-item:not(.hidden)');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    // Add new transaction every 6 seconds
    setInterval(addNextTransaction, 6000);
}

/**
 * Update map tooltip for real state data
 */
function initStateTooltips() {
    const states = document.querySelectorAll('.state-region');
    const tooltip = document.getElementById('mapTooltip');

    if (!states.length || !tooltip) return;

    // SVG data-state (Keys) to CSV State Names (Values)
    const svgToDataMap = {
        'HR': 'Haryana',
        'MH': 'Maharashtra',
        'GJ': 'Gujarat',
        'TN': 'Tamil Nadu',
        'TS': 'Telangana',
        'UP': 'UP',
        'DL': 'Delhi',
        'KA': 'Karnataka',
        'PB': 'Punjab',
        'RJ': 'Rajasthan',
        'BR': 'Bihar',
        'WB': 'West Bengal',
        'JH': 'Jharkhand',
        'MP': 'Madhya Pradesh',
        'CG': 'Chhattisgarh',
        'OD': 'Odisha',
        'AP': 'Andhra Pradesh',
        'KL': 'Kerala',
        'J&K': 'Jammu & Kashmir',
        'NE': 'North East'
    };

    states.forEach(state => {
        state.addEventListener('mouseenter', (e) => {
            const svgCode = state.getAttribute('data-state');

            // 1. Resolve full name
            let dataName = svgToDataMap[svgCode];
            if (!dataName && stateStats[svgCode]) dataName = svgCode;

            // 2. Get stats
            const stats = stateStats[dataName];

            if (stats) {
                const fraudRate = ((stats.fraudCount / stats.transactions) * 100).toFixed(1);
                const level = state.getAttribute('data-level') || 'Low';

                tooltip.querySelector('.tooltip-city').textContent = dataName; // Show full name in tooltip
                tooltip.querySelector('.tooltip-txn').textContent =
                    `Transactions: ${stats.transactions} | Fraud: ${stats.fraudCount}`;
                tooltip.querySelector('.tooltip-fraud').textContent =
                    `Risk Level: ${level} (${fraudRate}%)`;

                const cityEl = tooltip.querySelector('.tooltip-city');
                cityEl.style.color = level === 'High' ? 'var(--accent-red)' :
                    level === 'Medium' ? '#FFB800' : 'var(--accent-green)';
            } else {
                // Handle case where no data exists for this state
                tooltip.querySelector('.tooltip-city').textContent = svgCode;
                tooltip.querySelector('.tooltip-txn').textContent = "No Data";
                tooltip.querySelector('.tooltip-fraud').textContent = "";
            }

            const container = document.querySelector('.map-container');
            const containerRect = container.getBoundingClientRect();

            tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
            tooltip.style.top = (e.clientY - containerRect.top - 40) + 'px';
            tooltip.style.transform = 'none';
            tooltip.classList.add('visible');
        });

        state.addEventListener('mousemove', (e) => {
            const container = document.querySelector('.map-container');
            const containerRect = container.getBoundingClientRect();
            tooltip.style.left = (e.clientX - containerRect.left + 15) + 'px';
            tooltip.style.top = (e.clientY - containerRect.top - 40) + 'px';
        });

        state.addEventListener('mouseleave', () => {
            tooltip.classList.remove('visible');
        });
    });
}

// Export for use in main app
window.dashboardData = {
    loadCSVData,
    transactionData: () => transactionData,
    stateStats: () => stateStats,
    dashboardStats: () => dashboardStats,
    initLiveTransactions,
    initStateTooltips
};