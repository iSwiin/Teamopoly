# Teamopoly (MVP)

Monopoly‑styled fairness dashboard for group projects.

## Quick start

### Backend
```
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### Frontend
```
cd ../frontend
npm i
npm run dev
```
Open http://localhost:5173
