FROM python:3.11-slim

# Install curl for health checks
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code and model
COPY fraud_api.py .
COPY upi_fraud_risk_models.pkl .

# Expose the port
EXPOSE 8000

# Run the FastAPI application with uvicorn
CMD ["uvicorn", "fraud_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
