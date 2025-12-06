import fs from "fs";
import csv from "csv-parser";
import axios from "axios";
import { checkHardcodedRules } from "../utils/rules.utils.js";
import { TransactionModel } from "../models/transaction.model.js";

/**
 * Process uploaded CSV transaction file
 * Sends each transaction to ML service for fraud scoring
 * @param {string} filePath - Path to uploaded CSV file
 * @returns {Promise<Array>} - Array of processed transactions with fraud scores
 */
export const processTransactionFile = (filePath) => {
    return new Promise((resolve, reject) => {
        const transactions = [];

        // Step 1: Read and Parse the CSV File
        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (row) => {
                transactions.push(row);
            })
            .on("end", async () => {
                try {
                    console.log(`📄 Parsed ${transactions.length} transactions from CSV`);

                    // Step 2: Process each transaction
                    const results = await processTransactions(transactions);

                    // Step 3: Save to database
                    if (results.length > 0) {
                        await TransactionModel.bulkCreate(results);
                        console.log(`✅ Saved ${results.length} transactions to database`);
                    }

                    resolve(results);
                } catch (error) {
                    console.error("❌ Error processing transactions:", error.message);
                    reject(error);
                }
            })
            .on("error", (error) => {
                reject(new Error(`CSV parsing failed: ${error.message}`));
            });
    });
};

/**
 * Process array of transactions with ML scoring
 * @param {Array} transactions - Array of transaction objects
 * @returns {Promise<Array>} - Processed transactions with scores
 */
async function processTransactions(transactions) {
    const mlApiUrl = process.env.ML_API_URL || "http://ml_engine:8000";
    const results = [];

    for (let i = 0; i < transactions.length; i++) {
        const txn = transactions[i];
        
        try {
            // Apply hardcoded rules first
            const ruleScore = checkHardcodedRules(txn);

            // Prepare transaction for ML API
            const mlPayload = prepareMlPayload(txn);

            // Call ML API for fraud prediction
            const mlScore = await callMlApi(mlApiUrl, mlPayload);

            // Combine scores: 40% rules, 60% ML
            let finalRisk = ruleScore * 0.4 + mlScore * 0.6;

            // Hard override for high-risk rule detections
            if (ruleScore >= 0.9) {
                finalRisk = 1.0;
            }

            // Build result object
            const result = {
                transaction_id: txn.txn_id || `TXN-${Date.now()}-${i}`,
                sender_upi: txn.sender_vpa || txn.sender_upi || "unknown",
                receiver_upi: txn.receiver_vpa || txn.receiver_upi || "unknown",
                amount: parseFloat(txn.amount) || 0,
                risk_score: parseFloat(finalRisk.toFixed(3)),
                verdict: finalRisk > 0.7 ? "FRAUD" : "SAFE",
                reason: finalRisk > 0.7 
                    ? "High Risk Detected by Hybrid Engine" 
                    : "Clean",
                ml_score: mlScore,
                rule_score: ruleScore,
            };

            results.push(result);

            // Log progress every 100 transactions
            if ((i + 1) % 100 === 0) {
                console.log(`⚙️  Processed ${i + 1}/${transactions.length} transactions`);
            }

        } catch (error) {
            console.error(`⚠️  Error processing transaction ${txn.txn_id}:`, error.message);
            
            // For failed ML calls, use rule-based scoring only
            const ruleScore = checkHardcodedRules(txn);
            results.push({
                transaction_id: txn.txn_id || `TXN-${Date.now()}-${i}`,
                sender_upi: txn.sender_vpa || "unknown",
                receiver_upi: txn.receiver_vpa || "unknown",
                amount: parseFloat(txn.amount) || 0,
                risk_score: parseFloat(ruleScore.toFixed(3)),
                verdict: ruleScore > 0.7 ? "FRAUD" : "SAFE",
                reason: "ML unavailable - Rule-based scoring only",
                ml_score: null,
                rule_score: ruleScore,
            });
        }
    }

    return results;
}

/**
 * Prepare transaction data for ML API payload
 * @param {Object} txn - Transaction object from CSV
 * @returns {Object} - Formatted payload for ML API
 */
function prepareMlPayload(txn) {
    return {
        amount: parseFloat(txn.amount) || 0,
        is_new_counterparty: parseBool(txn.is_new_counterparty, false),
        device_change: parseBool(txn.device_change, false),
        location_change: parseBool(txn.location_change, false),
        channel: txn.channel || "intent",
        page_context: txn.page_context || "normal_payment",
        requires_pin: parseBool(txn.requires_pin, true),
        anomaly_score: parseFloat(txn.anomaly_score) || 0,
        sender_in_degree_7d: parseInt(txn.sender_in_degree_7d) || 0,
        sender_out_degree_7d: parseInt(txn.sender_out_degree_7d) || 0,
        sender_in_out_ratio: parseFloat(txn.sender_in_out_ratio) || 0,
        fake_claim_count_user_7d: parseInt(txn.fake_claim_count_user_7d) || 0,
        is_screen_recording_on: parseBool(txn.is_screen_recording_on, false),
        is_remote_access_app_running: parseBool(txn.is_remote_access_app_running, false),
        is_call_active_during_payment: parseBool(txn.is_call_active_during_payment, false),
    };
}

/**
 * Call ML API with retry logic
 * @param {string} apiUrl - Base URL of ML service
 * @param {Object} payload - Transaction payload
 * @returns {Promise<number>} - Fraud probability (0-1)
 */
async function callMlApi(apiUrl, payload, retries = 3) {
    const endpoint = `${apiUrl}/predict-fraud`;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.post(endpoint, payload, {
                timeout: 5000,
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            // Extract fraud probability from response
            return response.data.fraud_probability || 0;

        } catch (error) {
            if (attempt === retries) {
                throw new Error(`ML API failed after ${retries} attempts: ${error.message}`);
            }
            
            // Exponential backoff
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            await new Promise(resolve => setTimeout(resolve, delay));
            
            console.log(`🔄 Retry ${attempt}/${retries} for ML API call`);
        }
    }
}

/**
 * Parse boolean values from CSV strings
 * @param {any} value - Value to parse
 * @param {boolean} defaultValue - Default if parsing fails
 * @returns {boolean}
 */
function parseBool(value, defaultValue = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return defaultValue;
}

