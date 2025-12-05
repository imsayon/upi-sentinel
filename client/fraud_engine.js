/**************************************************************
 *  UPI FRAUD DETECTION ENGINE - FULL VERSION
 *  (Prints every field & state)
 *************************************************************/

const fs = require("fs");
const csv = require("csv-parser");
const readline = require("readline");

/**************************************************************
 *  RULE CONFIGS
 *************************************************************/

const RULES = {
  verification_pattern: {
    weight: 0.30,
    description: "Small amount test transaction followed by high debit",
    category: "social_engineering"
  },
  new_contact_high_amount: {
    weight: 0.20,
    description: "High-value payment to a new counterparty",
    category: "recipient_context"
  },
  qr_mismatch: {
    weight: 0.40,
    description: "QR scanned VPA does not match registered merchant",
    category: "merchant_integrity"
  },
  refund_scam_pattern: {
    weight: 0.35,
    description: "Refund/cashback flow but outbound transaction requiring PIN",
    category: "ui_phishing"
  },
  device_change_high_value: {
    weight: 0.20,
    description: "Large outgoing payment from newly switched device",
    category: "device_context"
  },
  location_change_high_value: {
    weight: 0.20,
    description: "High-value payment from abnormal location",
    category: "geo_anomaly"
  },
  high_anomaly_score: {
    weight: 0.25,
    description: "ML anomaly model indicates unusual deviation",
    category: "behavior_anomaly"
  }
};

const CATEGORY_CAPS = {
  social_engineering: 0.45,
  recipient_context: 0.30,
  merchant_integrity: 0.45,
  ui_phishing: 0.40,
  device_context: 0.25,
  geo_anomaly: 0.25,
  behavior_anomaly: 0.35
};

const globalCounterpartyRisk = {};

/**************************************************************
 *  RULE ENGINE
 *************************************************************/
function evaluateTransaction(txn) {
  let results = [];
  let categoryScores = {};

  const addRule = (id) => {
    const rule = RULES[id];
    if (!rule) return;

    if (!categoryScores[rule.category]) {
      categoryScores[rule.category] = 0;
    }

    categoryScores[rule.category] += rule.weight;
    results.push({
      id,
      score: rule.weight,
      description: rule.description,
      category: rule.category
    });
  };

  if (
    txn.previous_small_transactions?.length > 0 &&
    txn.amount > 1000 &&
    txn.is_new_counterparty
  ) {
    const smallTxnToSame = txn.previous_small_transactions.some(
      t => t.counterparty === txn.receiver_vpa && t.amount <= 10
    );
    if (smallTxnToSame) addRule("verification_pattern");
  }

  if (txn.is_new_counterparty && txn.amount > 5000) {
    addRule("new_contact_high_amount");
  }

  if (
    txn.channel === "qr" &&
    txn.scanned_qr_vpa &&
    txn.merchant_expected_vpa &&
    txn.scanned_qr_vpa !== txn.merchant_expected_vpa
  ) {
    addRule("qr_mismatch");
  }

  const suspiciousPages = ["refund_screen", "cashback_screen", "support_claim"];
  if (
    suspiciousPages.includes(txn.page_context) &&
    txn.requires_pin === true
  ) {
    addRule("refund_scam_pattern");
  }

  if (txn.device_change && txn.amount > 2000) {
    addRule("device_change_high_value");
  }

  if (txn.location_change && txn.amount > 2000) {
    addRule("location_change_high_value");
  }

  if (txn.anomaly_score >= 0.55) {
    addRule("high_anomaly_score");
  }

  const cScore = globalCounterpartyRisk[txn.receiver_vpa] || 0;
  if (cScore > 0) {
    results.push({
      id: "counterparty_risk",
      score: cScore,
      description: "Receiver VPA flagged in global risk list",
      category: "recipient_context"
    });

    if (!categoryScores["recipient_context"]) {
      categoryScores["recipient_context"] = 0;
    }

    categoryScores["recipient_context"] += cScore;
  }

  for (let c in categoryScores) {
    if (categoryScores[c] > CATEGORY_CAPS[c]) {
      categoryScores[c] = CATEGORY_CAPS[c];
    }
  }

  const totalScore = Math.min(
    Object.values(categoryScores).reduce((a, b) => a + b, 0),
    1
  );

  const confidence =
    results.length === 0 ? 0 : Math.min((totalScore * 1.5).toFixed(2), 1);

  return {
    overall_score: totalScore,
    confidence,
    risk_level:
      totalScore >= 0.65 ? "HIGH" :
      totalScore >= 0.35 ? "MEDIUM" :
      "LOW",
    triggered_rules: results,
    category_breakdown: categoryScores
  };
}

/**************************************************************
 *  CSV LOAD + NORMALIZE (FULL DATA)
 *************************************************************/
let TRANSACTIONS_DB = [];

function normalizeTransaction(row) {
  return {
    ...row,
    amount: Number(row.amount),
    is_new_counterparty: row.is_new_counterparty === "true",
    device_change: row.device_change === "true",
    location_change: row.location_change === "true",
    requires_pin: row.requires_pin === "true",
    anomaly_score: parseFloat(row.anomaly_score),
    state: row.state || "Unknown",
    previous_small_transactions: []
  };
}

function loadCSV(path) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(path)
      .pipe(csv())
      .on("data", row => TRANSACTIONS_DB.push(normalizeTransaction(row)))
      .on("end", () => resolve(true))
      .on("error", reject);
  });
}

/**************************************************************
 *  Build small txn history
 *************************************************************/
function addSmallTxnHistory() {
  for (const txn of TRANSACTIONS_DB) {
    txn.previous_small_transactions = TRANSACTIONS_DB.filter(
      t =>
        t.sender_vpa === txn.sender_vpa &&
        t.receiver_vpa === txn.receiver_vpa &&
        t.amount <= 10 &&
        new Date(t.timestamp) < new Date(txn.timestamp)
    ).map(s => ({
      amount: s.amount,
      timestamp: s.timestamp,
      counterparty: s.receiver_vpa
    }));
  }
}

/**************************************************************
 *  Search and Evaluate (FULL PRINT MODE)
 *************************************************************/
function evaluateByTxnId(id) {
  const txn = TRANSACTIONS_DB.find(t => t.txn_id === id);

  if (!txn) {
    console.log(`❌ No transaction found for txn_id: ${id}`);
    return;
  }

  console.log("\n================ FULL TRANSACTION DATA ================");
  console.log(txn);

  console.log("\n🔁 Previous Small Transactions (<= ₹10):");
  console.log(
    txn.previous_small_transactions.length > 0
      ? txn.previous_small_transactions
      : "None"
  );

  console.log("\n================ FRAUD RULE EVALUATION ================");

  const result = evaluateTransaction(txn);

  console.log("\n📌 OVERALL METRICS");
  console.log({
    score: result.overall_score,
    confidence: result.confidence,
    risk_level: result.risk_level
  });

  console.log("\n🚨 Triggered Rules:");
  if (result.triggered_rules.length === 0) {
    console.log("No suspicious rules triggered");
  } else {
    console.table(
      result.triggered_rules.map(r => ({
        Rule: r.id,
        Score: r.score,
        Category: r.category,
        Description: r.description
      }))
    );
  }

  console.log("\n📦 Category Score Breakdown:");
  console.log(result.category_breakdown);

  console.log("\n=========================================================");
}

/**************************************************************
 *  MAIN (User Inputs TXN_ID)
 *************************************************************/
(async () => {
  const CSV_PATH = "./ml_ready_upi_fraud_dataset.csv";

  console.log("📥 Loading CSV...");
  await loadCSV(CSV_PATH);
  console.log(`✔ Loaded ${TRANSACTIONS_DB.length} transactions`);

  console.log("\n🔁 Building historical patterns...");
  addSmallTxnHistory();
  console.log("✔ Done!");

  console.log("\n💡 Enter TXN_ID to evaluate:");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  rl.question("> ", (txnId) => {
    evaluateByTxnId(txnId.trim());
    rl.close();
  });
})();
