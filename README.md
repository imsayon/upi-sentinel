# RakshaNet - Distributed Fraud Detection System

Production-grade UPI fraud detection system with Node.js backend, Python ML engine, and Vanilla JS frontend.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Port 80, 3000, 5432, and 8000 available

### Deploy All Services

```bash
# 1. Clone the repository (if not already done)
cd rakshanet

# 2. Create environment configuration
cp .env.example .env
# Edit .env and set your POSTGRES_PASSWORD

# 3. Build and start all services
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# 5. Access the dashboard
open http://localhost
```

## 📦 Services

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| **Client** | `rakshanet_client` | 80 | Nginx serving frontend + API proxy |
| **API** | `rakshanet_api` | 3000 | Node.js/Express backend |
| **ML Engine** | `rakshanet_ml_engine` | 8000 | Python/FastAPI fraud detection |
| **Database** | `rakshanet_db` | 5432 | PostgreSQL data storage |

## 🏗️ Architecture

```
Frontend (Nginx) → Node.js Backend → Python ML Engine → PostgreSQL Database
```

**Integration Flow:**
1. User uploads CSV via frontend
2. Nginx proxies to Node API at `/api/*`
3. Node parses CSV and sends each transaction to ML engine
4. ML engine scores each transaction for fraud probability
5. Results stored in PostgreSQL
6. Frontend polls and displays real-time data

## 🔧 Configuration

All configuration via environment variables in `.env`:

```env
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=upi_sentinel_db

# API
NODE_ENV=production
ML_API_URL=http://ml_engine:8000
CORS_ORIGIN=*

# Ports (optional, defaults shown)
API_PORT=3000
ML_PORT=8000
CLIENT_PORT=80
DB_PORT=5432
```

## 📊 API Endpoints

### Node.js Backend (Port 3000)

- `GET /` - API information
- `GET /health` - Health check
- `POST /api/transactions/upload` - Upload CSV for processing

### ML Engine (Port 8000)

- `GET /` - Service information
- `GET /health` - Health check
- `POST /predict-fraud` - Fraud prediction endpoint

### Frontend (Port 80)

- `GET /` - Dashboard UI
- `GET /health` - Nginx health check
- `/api/*` - Proxied to Node backend

## 🧪 Testing

```bash
# Check service health
curl http://localhost/health       # Nginx
curl http://localhost:3000/health  # Node API
curl http://localhost:8000/health  # ML Engine

# Test ML prediction
curl -X POST http://localhost:8000/predict-fraud \
  -H "Content-Type: application/json" \
  -d '{"amount": 5000, "is_new_counterparty": true, ...}'

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

## 🛠️ Development

```bash
# Rebuild specific service
docker-compose build api

# Restart services
docker-compose restart

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## 📝 Key Features

✅ **Production-Ready Integration**
- No mock or simulation logic
- Real API communication with retry logic
- Proper error handling and graceful degradation

✅ **Docker Orchestration**
- Health checks for all services
- Dependency management (db → ml_engine → api → client)
- Environment variable configuration
- Persistent PostgreSQL volumes

✅ **Error Handling**
- Exponential backoff retry logic
- Fallback to rule-based scoring if ML fails
- User-facing error notifications
- Comprehensive logging

✅ **Security**
- No hardcoded secrets
- Environment variable-based config
- CORS protection
- Nginx reverse proxy

## 📂 Project Structure

```
rakshanet/
├── client/              # Frontend (Nginx + Vanilla JS)
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   ├── app.js          # Real API integration
│   └── styles.css
├── server/              # Backend (Node.js/Express)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app.js      # Express server
│       ├── services/
│       │   └── transaction.services.js  # ML integration
│       └── ...
├── ml-model/            # ML Engine (Python/FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── fraud_api.py    # FastAPI endpoints
│   └── upi_fraud_risk_models.pkl
├── docker-compose.yml   # Service orchestration
├── .env.example        # Environment template
└── README.md
```

## 🐛 Troubleshooting

**Services won't start:**
```bash
docker-compose logs
docker-compose down && docker-compose up -d
```

**Database connection failed:**
```bash
# Check database health
docker exec rakshanet_db pg_isready -U postgres
```

**ML predictions failing:**
```bash
# Verify model file
docker exec rakshanet_ml_engine ls -lh /app/*.pkl

# Check ML logs
docker-compose logs ml_engine
```

**Frontend can't connect to API:**
- Check browser console for errors
- Verify CORS settings in `.env`
- Test API directly: `curl http://localhost:3000/health`

## 📖 Documentation

- **Deployment Guide**: See `walkthrough.md` in artifacts
- **Implementation Details**: See `implementation_plan.md` in artifacts
- **Environment Setup**: See `.env.example`

## 🔐 Security Notes

- Change `POSTGRES_PASSWORD` in production
- Set `CORS_ORIGIN` to your domain (not `*`)
- Consider adding API authentication
- Use HTTPS in production with SSL certificates
- Regularly update dependencies

## 📄 License

Internal use only.

---

**Built with:** Node.js, Express, FastAPI, PostgreSQL, Nginx, Docker
