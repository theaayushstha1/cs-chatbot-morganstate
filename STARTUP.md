# Local Development Setup

Run each command in a separate terminal tab. Start in this order:

## 1. ADK Engine (port 8080)

```powershell
cd adk_agent
$env:GOOGLE_GENAI_USE_VERTEXAI="TRUE"
$env:GOOGLE_CLOUD_PROJECT="cs-navigator-498115"
$env:GOOGLE_CLOUD_LOCATION="us-central1"
$env:AGENT_MODEL="gemini-2.5-flash"
..\.venv\Scripts\python.exe -m google.adk.cli web . --port 8080 --host 127.0.0.1
```

## 2. Backend (port 8000)

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

## 3. Frontend (port 5173)

```powershell
cd frontend
npm run dev
```

## Open in browser

```
http://localhost:5173
```
