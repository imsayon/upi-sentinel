from fastapi import FastAPI
from pydantic import BaseModel
import pandas as pd
import joblib

MODEL_PATH = "upi_fraud_risk_models.pkl"

# ---------- Load model ONCE at startup ----------
bundle = joblib.load(MODEL_PATH)
feature_cols = bundle["feature_cols"]
main_model = bundle["main_model"]
subtype_models = bundle["subtype_models"]

app = FastAPI(title="UPI Fraud Risk API", version="1.0.0")


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
        "message": "UPI Fraud Risk API is running",
        "usage": "Send POST request to /predict-fraud with transaction JSON",
    }


@app.post("/predict-fraud")
def predict_fraud(txn: TransactionInput):
    """
    Main prediction endpoint.
    Input: TransactionInput JSON
    Output: fraud + subtype probabilities + decision + risk level
    """
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

