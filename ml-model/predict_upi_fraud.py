import pandas as pd
import joblib

MODEL_PATH = "upi_fraud_risk_models.pkl"


def load_model():
    """
    Load the trained model bundle from disk.
    Bundle contains:
      - feature_cols: list of feature names used during training
      - main_model: RandomForest classifier for overall fraud
      - subtype_models: dict of RandomForest classifiers for qr/mule/coercion
    """
    bundle = joblib.load(MODEL_PATH)
    print("Loaded models and feature list")
    return bundle


def prepare_features(transaction_json, feature_cols):
    """
    Convert a single transaction JSON/dict into a DataFrame
    with the exact same feature columns used during training.
    """

    # Convert dict → DataFrame with one row
    df = pd.DataFrame([transaction_json])

    # One-hot encode the same categorical columns we used in training
    # (channel, page_context) with drop_first=True
    df = pd.get_dummies(df, columns=["channel", "page_context"], drop_first=True)

    # Ensure every expected feature column exists
    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0  # default 0 for missing features

    # Reorder columns to match training exactly
    df = df[feature_cols]

    return df


def predict_transaction(transaction_json):
    """
    Given a transaction (as a dict), return fraud probabilities + decision.
    """
    # 1) Load model bundle
    bundle = load_model()
    feature_cols = bundle["feature_cols"]
    main_model = bundle["main_model"]
    subtype_models = bundle["subtype_models"]

    # 2) Prepare feature vector
    X = prepare_features(transaction_json, feature_cols)

    # 3) Get probabilities (they come as numpy.float64)
    fraud_prob = main_model.predict_proba(X)[0][1]
    qr_prob = subtype_models["qr_fraud"].predict_proba(X)[0][1]
    mule_prob = subtype_models["mule_fraud"].predict_proba(X)[0][1]
    coercion_prob = subtype_models["coercion_fraud"].predict_proba(X)[0][1]

    # 4) Convert to normal Python floats
    fraud_prob = float(fraud_prob)
    qr_prob = float(qr_prob)
    mule_prob = float(mule_prob)
    coercion_prob = float(coercion_prob)

    # 5) Simple decision logic based on overall fraud probability
    if fraud_prob > 0.8:
        action = "BLOCK_AND_ALERT"
        risk_level = "HIGH"
    elif fraud_prob > 0.5:
        action = "WARN"
        risk_level = "MEDIUM"
    else:
        action = "ALLOW"
        risk_level = "LOW"

    # 6) Build response
    return {
        "fraud_probability": round(fraud_prob, 3),
        "qr_fraud_probability": round(qr_prob, 3),
        "mule_fraud_probability": round(mule_prob, 3),
        "coercion_fraud_probability": round(coercion_prob, 3),
        "risk_level": risk_level,
        "decision": action,
    }


if __name__ == "__main__":
    # 🔹 Example test transaction (you can change values and re-run)
    sample_txn = {
        # Core numeric / boolean features
        "amount": 45000,
        "is_new_counterparty": True,
        "device_change": False,
        "location_change": True,

        # Categorical features (important for one-hot)
        "channel": "qr",                 # e.g. "qr", "intent", "collect", "mandate"
        "page_context": "normal_payment",  # e.g. "normal_payment", "refund_page", ...

        "requires_pin": True,
        "anomaly_score": 0.85,

        # Mule behaviour features
        "sender_in_degree_7d": 15,
        "sender_out_degree_7d": 12,
        "sender_in_out_ratio": 1.0,
        "fake_claim_count_user_7d": 2,

        # Coercion / screen-share features
        "is_screen_recording_on": True,
        "is_remote_access_app_running": True,
        "is_call_active_during_payment": True,
    }

    result = predict_transaction(sample_txn)
    print("Prediction Response:\n", result)
