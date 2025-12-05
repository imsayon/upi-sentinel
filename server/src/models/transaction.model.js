import { pool } from "../db.js";

export const TransactionModel = {
    // FIX: Match the SQL Schema we created earlier
    create: async (txn) => {
        const query = `
            INSERT INTO transactions 
            (txn_id, sender_vpa, receiver_vpa, amount, transaction_timestamp, anomaly_score, is_fraud)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING txn_id;
        `;
        const values = [
            txn.txn_id,
            txn.sender_vpa,
            txn.receiver_vpa,
            txn.amount,
            txn.timestamp || new Date(),
            txn.risk_score || 0,
            txn.verdict === "FRAUD",
        ];
        return pool.query(query, values);
    },

    // FIX: Add the missing bulkCreate function for your CSV upload
    bulkCreate: async (transactions) => {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            for (const txn of transactions) {
                const query = `
                    INSERT INTO transactions 
                    (txn_id, sender_vpa, receiver_vpa, amount, transaction_timestamp, anomaly_score, is_fraud)
                    VALUES ($1, $2, $3, $4, NOW(), $5, $6)
                    ON CONFLICT (txn_id) DO UPDATE 
                    SET anomaly_score = EXCLUDED.anomaly_score, is_fraud = EXCLUDED.is_fraud;
                `;
                // Map the Service data to DB columns
                await client.query(query, [
                    txn.transaction_id, // Mapped from service
                    txn.sender_upi,
                    "unknown@upi", // Receiver is missing in service mapping!
                    txn.amount,
                    txn.risk_score,
                    txn.verdict === "FRAUD",
                ]);
            }
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    },
};
