import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import joblib

DATA_PATH = "ml_ready_upi_fraud_dataset.csv"
MODEL_PATH = "upi_fraud_risk_models.pkl"


def load_and_prepare_data(path: str):
    df = pd.read_csv(path)
    print(f"Loaded dataset: {df.shape[0]} rows, {df.shape[1]} columns")
    print(df.head())

    # Label columns
    main_label = "fraud"
    subtype_labels = ["qr_fraud", "mule_fraud", "coercion_fraud"]

    # Columns that are IDs / raw text → we DROP as features
    id_or_text_cols = [
        "txn_id",
        "timestamp",
        "sender_vpa",
        "receiver_vpa",
        "scanned_qr_vpa",
        "merchant_expected_vpa",
        "state",
    ]

    # Categorical columns we will one-hot encode
    categorical_cols = ["channel", "page_context"]

    # 1) Separate labels
    y_main = df[main_label]
    y_subtypes = df[subtype_labels].copy()

    # 2) Drop id/text + label columns before encoding
    df_features = df.drop(columns=id_or_text_cols + [main_label] + subtype_labels)

    # 3) One-hot encode categoricals
    df_features = pd.get_dummies(df_features, columns=categorical_cols, drop_first=True)

    print("\nFinal feature columns:")
    print(list(df_features.columns))

    return df_features, y_main, y_subtypes


def train_main_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.3,
        random_state=42,
        stratify=y,
    )

    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=None,
        random_state=42,
        class_weight="balanced",
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print("\n=== Main FRAUD model report (fraud vs non-fraud) ===")
    print(classification_report(y_test, y_pred))

    return model


def train_subtype_models(X, y_subtypes):
    subtype_models = {}
    for label in y_subtypes.columns:
        print(f"\nTraining subtype model for: {label}")
        y = y_subtypes[label]

        model = RandomForestClassifier(
            n_estimators=150,
            max_depth=None,
            random_state=42,
            class_weight="balanced",
        )
        model.fit(X, y)
        subtype_models[label] = model

    return subtype_models


def main():
    # 1) Load + preprocess
    X, y_main, y_subtypes = load_and_prepare_data(DATA_PATH)

    # 2) Train main fraud classifier
    main_model = train_main_model(X, y_main)

    # 3) Train subtype models (QR / Mule / Coercion)
    subtype_models = train_subtype_models(X, y_subtypes)

    # 4) Save bundle
    bundle = {
        "feature_cols": list(X.columns),
        "main_model": main_model,
        "subtype_models": subtype_models,
    }

    joblib.dump(bundle, MODEL_PATH)
    print(f"\n✅ Models saved to: {MODEL_PATH}")

    # 5) Demo predictions on first 5 rows
    print("\n=== Demo predictions on first 5 transactions ===")
    sample = X.head(5)

    main_probs = main_model.predict_proba(sample)[:, 1]
    qr_probs = subtype_models["qr_fraud"].predict_proba(sample)[:, 1]
    mule_probs = subtype_models["mule_fraud"].predict_proba(sample)[:, 1]
    coercion_probs = subtype_models["coercion_fraud"].predict_proba(sample)[:, 1]

    demo_df = pd.DataFrame({
        "fraud_prob": main_probs.round(3),
        "qr_fraud_prob": qr_probs.round(3),
        "mule_fraud_prob": mule_probs.round(3),
        "coercion_fraud_prob": coercion_probs.round(3),
    })

    print(demo_df)


if __name__ == "__main__":
    main()
