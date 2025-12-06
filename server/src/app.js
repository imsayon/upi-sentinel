import "dotenv/config";
import express from "express";
import cors from "cors";
import transactionRoutes from "./routes/transaction.routes.js";
import { pool } from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middlewares ---
// Configure CORS for containerized environment
const corsOptions = {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health Check Endpoint ---
app.get("/health", (req, res) => {
    res.status(200).json({
        status: "healthy",
        service: "rakshanet-api",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// --- Routes ---
app.get("/", (req, res) => {
    res.json({
        message: "🚀 RakshaNet Fraud Detection API",
        version: "1.0.0",
        status: "online",
        endpoints: {
            health: "/health",
            transactions: "/api/transactions"
        }
    });
});

app.use("/api/transactions", transactionRoutes);

// --- Database Connection Check ---
pool.query("SELECT NOW()", (err, result) => {
    if (err) {
        console.error("⚠️  Database connection failed:", err.message);
        console.log("⚙️  Running in limited mode without database");
    } else {
        console.log("✅ Connected to PostgreSQL database");
        console.log(`📊 Database time: ${result.rows[0].now}`);
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error("❌ Error:", err.stack);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || "Internal Server Error",
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`🚀 RakshaNet API Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    console.log(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN || '*'}`);
    console.log(`🤖 ML Service URL: ${process.env.ML_API_URL || 'http://ml_engine:8000'}`);
});
