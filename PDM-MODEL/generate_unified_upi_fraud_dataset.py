import numpy as np
import pandas as pd
from datetime import datetime, timedelta


def generate_ml_ready_dataset(n_samples=300, fraud_ratio=0.25, random_state=42):
    rng = np.random.default_rng(random_state)

    # ---- 1) Basic IDs ----
    txn_ids = [f"TXN{100000 + i}" for i in range(1, n_samples + 1)]

    # Generate timestamps within a fixed range
    start_dt = datetime(2025, 12, 1, 8, 0, 0)
    timestamps = [
        (start_dt + timedelta(seconds=int(rng.integers(0, 7 * 24 * 3600)))).isoformat()
        for _ in range(n_samples)
    ]

    # sender / receiver VPAs
    senders = [f"user{rng.integers(1, 100)}@upi" for _ in range(n_samples)]
    receivers = []
    for _ in range(n_samples):
        if rng.random() < 0.6:  # 60% merchants
            receivers.append(f"merchant{rng.integers(1, 50)}@upi")
        else:
            receivers.append(f"user{rng.integers(1, 100)}@upi")

    # ---- 2) Base transaction features ----
    amount = rng.normal(loc=2000, scale=1000, size=n_samples)
    amount = np.clip(amount, 50, 200000).round(2)

    is_new_counterparty = rng.integers(0, 2, size=n_samples).astype(bool)
    device_change = rng.integers(0, 2, size=n_samples).astype(bool)
    location_change = rng.integers(0, 2, size=n_samples).astype(bool)

    channels = rng.choice(
        ["qr", "intent", "collect", "mandate"],
        size=n_samples,
        p=[0.4, 0.3, 0.2, 0.1]
    )

    # QR-specific fields
    scanned_qr_vpa = []
    merchant_expected_vpa = []
    for ch, recv in zip(channels, receivers):
        if ch == "qr" and recv.startswith("merchant"):
            # usually official
            if rng.random() < 0.9:
                scanned_qr_vpa.append(recv)
            else:
                scanned_qr_vpa.append(f"fraud{rng.integers(1, 50)}@upi")
            merchant_expected_vpa.append(recv)
        elif ch == "qr":
            # qr but non-merchant (person)
            scanned_qr_vpa.append(recv)
            merchant_expected_vpa.append("")
        else:
            scanned_qr_vpa.append("")
            merchant_expected_vpa.append("")

    page_contexts = rng.choice(
        ["normal_payment", "refund_page", "support_chat", "screen_share_suspected", "loan_offer_page"],
        size=n_samples,
        p=[0.6, 0.1, 0.15, 0.1, 0.05]
    )

    requires_pin = rng.integers(0, 2, size=n_samples).astype(bool)

    # base anomaly_score
    anomaly_score = np.clip(rng.normal(loc=0.2, scale=0.15, size=n_samples), 0, 1)

    states = rng.choice(
        ["Karnataka", "Maharashtra", "Delhi", "Haryana", "UP", "Gujarat", "Tamil Nadu", "Telangana"],
        size=n_samples
    )

    # ---- 3) Extra ML features ----

    # Mule-like behaviour (sender side aggregates)
    sender_in_degree_7d = rng.poisson(lam=1.0, size=n_samples)   # # of unique senders to this sender (upstream)
    sender_out_degree_7d = rng.poisson(lam=2.0, size=n_samples)  # # of unique receivers this sender pays
    sender_in_out_ratio = (sender_in_degree_7d / (sender_out_degree_7d + 1)).round(2)

    # Fake screenshot / trust abuse
    fake_claim_count_user_7d = rng.poisson(lam=0.1, size=n_samples)

    # Coercion / screen-share signals
    is_screen_recording_on = rng.integers(0, 2, size=n_samples).astype(bool)
    is_remote_access_app_running = rng.integers(0, 2, size=n_samples).astype(bool)
    is_call_active_during_payment = rng.integers(0, 2, size=n_samples).astype(bool)

    # ---- 4) Labels: fraud + 3 sub-types ----
    qr_fraud = np.zeros(n_samples, dtype=int)
    mule_fraud = np.zeros(n_samples, dtype=int)
    coercion_fraud = np.zeros(n_samples, dtype=int)

    n_fraud = int(n_samples * fraud_ratio)
    fraud_indices = rng.choice(n_samples, size=n_fraud, replace=False)

    for idx in fraud_indices:
        fraud_type = rng.choice(["qr", "mule", "coercion"])

        if fraud_type == "qr":
            qr_fraud[idx] = 1
            channels[idx] = "qr"
            # force mismatch QR + merchant
            if receivers[idx].startswith("merchant"):
                merchant_expected_vpa[idx] = receivers[idx]
                scanned_qr_vpa[idx] = f"fraud{rng.integers(1, 50)}@upi"
            else:
                merchant_expected_vpa[idx] = f"merchant{rng.integers(1, 50)}@upi"
                scanned_qr_vpa[idx] = f"fraud{rng.integers(1, 50)}@upi"
            # bump anomaly score
            anomaly_score[idx] = float(rng.uniform(0.7, 1.0))

        elif fraud_type == "mule":
            mule_fraud[idx] = 1
            # make sender look like mule
            sender_in_degree_7d[idx] = rng.integers(10, 40)
            sender_out_degree_7d[idx] = rng.integers(5, 30)
            sender_in_out_ratio[idx] = 1.0
            # high anomaly score
            anomaly_score[idx] = float(rng.uniform(0.6, 0.95))

        else:  # coercion
            coercion_fraud[idx] = 1
            is_screen_recording_on[idx] = True
            is_remote_access_app_running[idx] = True
            is_call_active_during_payment[idx] = True
            page_contexts[idx] = "screen_share_suspected"
            anomaly_score[idx] = float(rng.uniform(0.7, 1.0))

    fraud = ((qr_fraud + mule_fraud + coercion_fraud) > 0).astype(int)

    # ---- 5) Build DataFrame ----
    df = pd.DataFrame({
        "txn_id": txn_ids,
        "timestamp": timestamps,
        "sender_vpa": senders,
        "receiver_vpa": receivers,
        "amount": amount,
        "is_new_counterparty": is_new_counterparty,
        "device_change": device_change,
        "location_change": location_change,
        "channel": channels,
        "scanned_qr_vpa": scanned_qr_vpa,
        "merchant_expected_vpa": merchant_expected_vpa,
        "page_context": page_contexts,
        "requires_pin": requires_pin,
        "anomaly_score": anomaly_score.round(3),
        "state": states,

        # extra ML features
        "sender_in_degree_7d": sender_in_degree_7d,
        "sender_out_degree_7d": sender_out_degree_7d,
        "sender_in_out_ratio": sender_in_out_ratio,
        "fake_claim_count_user_7d": fake_claim_count_user_7d,
        "is_screen_recording_on": is_screen_recording_on,
        "is_remote_access_app_running": is_remote_access_app_running,
        "is_call_active_during_payment": is_call_active_during_payment,

        # labels
        "fraud": fraud,
        "qr_fraud": qr_fraud,
        "mule_fraud": mule_fraud,
        "coercion_fraud": coercion_fraud,
    })

    return df


if __name__ == "__main__":
    df = generate_ml_ready_dataset()
    out_path = "ml_ready_upi_fraud_dataset.csv"
    df.to_csv(out_path, index=False)
    print(f"✅ Dataset generated -> {out_path}")
    print(df.head())
    print("\nRow/Column count:", df.shape)
    print("\nFraud distribution:\n", df["fraud"].value_counts())
