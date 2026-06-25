# Local Development Setup

Run each command in a separate PowerShell terminal tab. Start from the
project root and run the services in this order.

For machine-specific values, copy the relevant commands into
`STARTUP.local.md`. That file is ignored by Git and is the right place for
your real Google Cloud project ID, local paths, or personal notes.

## 1. ADK Engine (port 8080)

The ADK server can run in Vertex AI mode with Application Default Credentials.
Replace the placeholder values with your own project and region.

```powershell
cd adk_agent
$env:GOOGLE_GENAI_USE_VERTEXAI="TRUE"
$env:GOOGLE_CLOUD_PROJECT="<your-google-cloud-project-id>"
$env:GOOGLE_CLOUD_LOCATION="<your-google-cloud-region>"
$env:AGENT_MODEL="gemini-2.5-flash"
..\.venv\Scripts\python.exe -m google.adk.cli web . --port 8080 --host 127.0.0.1
```

If Vertex authentication is not configured yet, run this once:

```powershell
gcloud auth application-default login
```

## 2. Backend (port 8000)

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Optional Redis cache for local development:

```powershell
$env:REDIS_URL="redis://127.0.0.1:6379/0"
```

Set that in the same terminal before starting the backend if you want L2 Redis
cache enabled locally.

## 3. Frontend (port 5173)

```powershell
cd frontend
npm run dev
```

## Open in browser

```text
http://localhost:5173
```
