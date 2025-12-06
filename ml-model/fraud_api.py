from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import joblib
import os

MODEL_PATH = os.getenv("MODEL_PATH", "upi_fraud_risk_models.pkl")

# ---------- Load model ONCE at startup ----------
try:
    bundle = joblib.load(MODEL_PATH)
    feature_cols = bundle["feature_cols"]
    main_model = bundle["main_model"]
    subtype_models = bundle["subtype_models"]
    print(f"✅ ML Model loaded successfully from {MODEL_PATH}")
except Exception as e:
    print(f"❌ Failed to load model: {e}")
    raise

app = FastAPI(
    title="RakshaNet ML Fraud Detection API",
    version="1.0.0",
    description="Production ML service for UPI fraud detection"
)

# ---------- CORS Configuration ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Request body schema ----------
class TransactionInput(BaseModel):
    amount: float
    is_new_counterparty: bool
    device_change: bool
    location_change: bool
    channel: str              # "qr", "intent", "collect", "mandate"
    page_context: str         # "normal_payment", "refund_page", etc.
    requires_pin: bool
    anomaly_score: float
    sender_in_degree_7d: int
    sender_out_degree_7d: int
    sender_in_out_ratio: float
    fake_claim_count_user_7d: int
    is_screen_recording_on: bool
    is_remote_access_app_running: bool
    is_call_active_during_payment: bool


def prepare_features_from_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply same preprocessing as training:
    - one-hot encode 'channel' and 'page_context'
    - add any missing feature columns
    - reorder columns to match feature_cols
    """
    # One-hot encode
    df = pd.get_dummies(df, columns=["channel", "page_context"], drop_first=True)

    # Ensure all expected feature columns exist
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0

    # Reorder to match training data
    df = df[feature_cols]

    return df


@app.get("/")
def root():
    return {
        "message": "RakshaNet ML Fraud Detection API is running",
        "version": "1.0.0",
        "status": "online",
        "usage": "Send POST request to /predict-fraud with transaction JSON",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for Docker"""
    return {
        "status": "healthy",
        "service": "rakshanet-ml-engine",
        "model_loaded": True,
        "model_path": MODEL_PATH
    }


@app.post("/predict-fraud")
def predict_fraud(txn: TransactionInput):
    """
    Main prediction endpoint.
    Input: TransactionInput JSON
    Output: fraud + subtype probabilities + decision + risk level
    """
    try:
        # Convert Pydantic model → dict → DataFrame
        txn_dict = txn.dict()
        df = pd.DataFrame([txn_dict])

        # Prepare features
        X = prepare_features_from_df(df)

        # Predict probabilities
        fraud_prob = float(main_model.predict_proba(X)[0][1])
        qr_prob = float(subtype_models["qr_fraud"].predict_proba(X)[0][1])
        mule_prob = float(subtype_models["mule_fraud"].predict_proba(X)[0][1])
        coercion_prob = float(subtype_models["coercion_fraud"].predict_proba(X)[0][1])

        # Decision logic from overall fraud probability
        if fraud_prob > 0.8:
            action = "BLOCK_AND_ALERT"
            risk_level = "HIGH"
        elif fraud_prob > 0.5:
            action = "WARN"
            risk_level = "MEDIUM"
        else:
            action = "ALLOW"
            risk_level = "LOW"

        return {
            "fraud_probability": round(fraud_prob, 3),
            "qr_fraud_probability": round(qr_prob, 3),
            "mule_fraud_probability": round(mule_prob, 3),
            "coercion_fraud_probability": round(coercion_prob, 3),
            "risk_level": risk_level,
            "decision": action,
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )


@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    print("🚀 RakshaNet ML Engine started")
    print(f"📊 Feature columns: {len(feature_cols)}")
    print(f"🤖 Models loaded: main + {len(subtype_models)} subtypes")


