#!/bin/bash
set -euo pipefail

# =============================================================================
# CSNavigator Cloud Run Deployment Script
# =============================================================================
# Deploys backend, frontend, and ADK agent to Google Cloud Run
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Docker installed
#   - Artifact Registry repository created
#
# Usage:
#   ./deploy-cloudrun.sh [all|backend|frontend|adk]
#
# =============================================================================

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Read only GOOGLE_CLOUD_PROJECT from .env. Do not source the whole file;
# secrets/passwords can contain characters that are not safe shell syntax.
if [ -f "${SCRIPT_DIR}/.env" ] && [ -z "${GOOGLE_CLOUD_PROJECT:-}" ]; then
    GOOGLE_CLOUD_PROJECT="$(grep -E '^GOOGLE_CLOUD_PROJECT=' "${SCRIPT_DIR}/.env" | tail -n 1 | cut -d'=' -f2- | tr -d '\r' || true)"
    export GOOGLE_CLOUD_PROJECT
fi

# Configuration
# Priority: PROJECT_ID env var > GOOGLE_CLOUD_PROJECT from .env > gcloud config.
PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
if [ -z "${PROJECT_ID}" ] && command -v gcloud >/dev/null 2>&1; then
    PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [ -z "${PROJECT_ID}" ]; then
    echo "[ERROR] No Google Cloud project found. Set GOOGLE_CLOUD_PROJECT in .env or run: gcloud config set project YOUR_PROJECT_ID" >&2
    exit 1
fi

REGION="${REGION:-us-central1}"
AGENT_MODEL="${AGENT_MODEL:-gemini-2.5-flash}"
REPO_NAME="${REPO_NAME:-csnavigator}"
MAX_INSTANCES="${MAX_INSTANCES:-3}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-${PROJECT_ID}:${REGION}:csnavigator-db}"
DATASTORE_ID="${DATASTORE_ID:-projects/${PROJECT_ID}/locations/us/collections/default_collection/dataStores/csnavigator-kb-v7}"

# Service names
BACKEND_SERVICE="${BACKEND_SERVICE:-csnavigator-backend}"
FRONTEND_SERVICE="${FRONTEND_SERVICE:-csnavigator-frontend}"
ADK_SERVICE="${ADK_SERVICE:-csnavigator-adk}"

# Artifact Registry paths
AR_HOST="${REGION}-docker.pkg.dev"
AR_REPO="${AR_HOST}/${PROJECT_ID}/${REPO_NAME}"

# Image names
BACKEND_IMAGE="${AR_REPO}/backend:latest"
FRONTEND_IMAGE="${AR_REPO}/frontend:latest"
ADK_IMAGE="${AR_REPO}/adk-agent:latest"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# =============================================================================
# Prerequisites Check
# =============================================================================
check_prerequisites() {
    log "Checking prerequisites..."

    command -v gcloud >/dev/null 2>&1 || error "gcloud CLI not installed"
    command -v docker >/dev/null 2>&1 || error "Docker not installed"

    # Check gcloud auth
    if ! gcloud auth print-access-token >/dev/null 2>&1; then
        error "Not authenticated with gcloud. Run: gcloud auth login"
    fi

    # Set project
    gcloud config set project ${PROJECT_ID} --quiet

    # Configure docker for Artifact Registry
    gcloud auth configure-docker ${AR_HOST} --quiet

    log "Prerequisites OK"
}

# =============================================================================
# Create Artifact Registry (if not exists)
# =============================================================================
setup_artifact_registry() {
    log "Setting up Artifact Registry..."

    if ! gcloud artifacts repositories describe ${REPO_NAME} \
        --location=${REGION} >/dev/null 2>&1; then
        log "Creating Artifact Registry repository..."
        gcloud artifacts repositories create ${REPO_NAME} \
            --repository-format=docker \
            --location=${REGION} \
            --description="CSNavigator container images"
    else
        log "Artifact Registry repository already exists"
    fi
}

# =============================================================================
# Build and Push Images
# =============================================================================
build_backend() {
    log "Building backend image..."
    docker build \
        --platform linux/amd64 \
        -t ${BACKEND_IMAGE} \
        "${SCRIPT_DIR}/backend"

    log "Pushing backend image..."
    docker push ${BACKEND_IMAGE}
}

build_frontend() {
    log "Building frontend image..."

    # Get backend URL for API calls
    BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)' 2>/dev/null || echo "")

    if [ -z "$BACKEND_URL" ]; then
        warn "Backend not deployed yet. Frontend will use relative URLs."
        BACKEND_URL=""
    fi

    docker build \
        --platform linux/amd64 \
        --build-arg VITE_API_BASE_URL="${BACKEND_URL}" \
        -t ${FRONTEND_IMAGE} \
        "${SCRIPT_DIR}/frontend"

    log "Pushing frontend image..."
    docker push ${FRONTEND_IMAGE}
}

build_adk() {
    log "Building ADK agent image..."
    docker build \
        --platform linux/amd64 \
        -t ${ADK_IMAGE} \
        "${SCRIPT_DIR}/adk_agent"

    log "Pushing ADK image..."
    docker push ${ADK_IMAGE}
}

# =============================================================================
# Deploy Services
# =============================================================================
deploy_adk() {
    log "Deploying ADK agent service..."

    gcloud run deploy ${ADK_SERVICE} \
        --image ${ADK_IMAGE} \
        --region ${REGION} \
        --platform managed \
        --port 8080 \
        --memory 2Gi \
        --cpu 2 \
        --min-instances 0 \
        --max-instances ${MAX_INSTANCES} \
        --timeout 300 \
        --concurrency 80 \
        --no-allow-unauthenticated \
        --service-account "csnavigator-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
        --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=${REGION},GOOGLE_GENAI_USE_VERTEXAI=TRUE,AGENT_MODEL=${AGENT_MODEL},UNIFIED_DATASTORE_ID=${DATASTORE_ID}"

    ADK_URL=$(gcloud run services describe ${ADK_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)')

    log "ADK deployed at: ${ADK_URL}"
    echo "${ADK_URL}" > "${SCRIPT_DIR}/.adk-url"
}

deploy_backend() {
    log "Deploying backend service..."

    # Get ADK service URL
    ADK_URL=$(gcloud run services describe ${ADK_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)' 2>/dev/null || echo "")

    if [ -z "$ADK_URL" ]; then
        error "ADK service not deployed. Run: ./deploy-cloudrun.sh adk"
    fi

    # Load env vars from .env file
    if [ -f "${SCRIPT_DIR}/.env" ]; then
        log "Loading environment variables from .env..."

        # Read specific vars we need
        DATABASE_URL=$(grep "^DATABASE_URL=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)
        JWT_SECRET=$(grep "^JWT_SECRET=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)
        ADMIN_EMAIL=$(grep "^ADMIN_EMAIL=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)
        ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)
    else
        error ".env file not found"
    fi

    FRONTEND_URL=$(gcloud run services describe ${FRONTEND_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)' 2>/dev/null || echo "")
    CORS_ENV=""
    APP_URL_ENV=""
    if [ -n "$FRONTEND_URL" ]; then
        CORS_ENV=",ALLOWED_ORIGINS=${FRONTEND_URL}"
        # APP_URL is the FRONTEND origin: verification success redirects here, and
        # email links point users back to the app.
        APP_URL_ENV=",APP_URL=${FRONTEND_URL}"
    fi

    # API_URL is this backend's own URL — used to build the verification link in
    # emails. It is set AFTER deploy (we don't know it yet) via a follow-up update.

    # Optional future: add OPENAI_API_KEY=OPENAI_API_KEY:latest to --set-secrets for TTS/OpenAI features.
    gcloud run deploy ${BACKEND_SERVICE} \
        --image ${BACKEND_IMAGE} \
        --region ${REGION} \
        --platform managed \
        --port 5000 \
        --memory 1Gi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances ${MAX_INSTANCES} \
        --timeout 300 \
        --concurrency 100 \
        --allow-unauthenticated \
        --service-account "csnavigator-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
        --add-cloudsql-instances "${CLOUD_SQL_INSTANCE}" \
        --set-env-vars "\
USE_VERTEX_AGENT=true,\
ADK_BASE_URL=${ADK_URL},\
ADK_APP_NAME=cs_navigator_unified,\
GOOGLE_CLOUD_PROJECT=${PROJECT_ID},\
GOOGLE_CLOUD_LOCATION=${REGION},\
VERTEX_AI_DATASTORE_ID=${DATASTORE_ID},\
UNIFIED_DATASTORE_ID=${DATASTORE_ID},\
APP_ENV=production,\
TRUSTED_HOSTS=*.run.app${CORS_ENV}${APP_URL_ENV}" \
        --set-secrets "\
DATABASE_URL=DATABASE_URL:latest,\
JWT_SECRET=JWT_SECRET:latest,\
ADMIN_EMAIL=ADMIN_EMAIL:latest,\
ADMIN_PASSWORD=ADMIN_PASSWORD:latest,\
RESEARCH_SECRET=RESEARCH_SECRET:latest,\
SMTP_USER=SMTP_USER:latest,\
SMTP_PASS=SMTP_PASS:latest"

    BACKEND_URL=$(gcloud run services describe ${BACKEND_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)')

    log "Backend deployed at: ${BACKEND_URL}"
    echo "${BACKEND_URL}" > "${SCRIPT_DIR}/.backend-url"

    # Now that the backend URL is known, set API_URL so verification emails build
    # the correct link (https://<backend>/api/verify-email?token=...).
    if [ -n "$BACKEND_URL" ]; then
        log "Setting API_URL=${BACKEND_URL} on the backend..."
        gcloud run services update ${BACKEND_SERVICE} \
            --region ${REGION} \
            --update-env-vars "API_URL=${BACKEND_URL}" >/dev/null
    fi
}

deploy_frontend() {
    log "Deploying frontend service..."

    gcloud run deploy ${FRONTEND_SERVICE} \
        --image ${FRONTEND_IMAGE} \
        --region ${REGION} \
        --platform managed \
        --port 8080 \
        --memory 512Mi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances ${MAX_INSTANCES} \
        --timeout 60 \
        --concurrency 200 \
        --allow-unauthenticated

    FRONTEND_URL=$(gcloud run services describe ${FRONTEND_SERVICE} \
        --region=${REGION} \
        --format='value(status.url)')

    log "Frontend deployed at: ${FRONTEND_URL}"
    echo "${FRONTEND_URL}" > "${SCRIPT_DIR}/.frontend-url"
}

# =============================================================================
# Setup Secrets (one-time)
# =============================================================================
setup_secrets() {
    log "Setting up Secret Manager secrets..."

    if [ ! -f "${SCRIPT_DIR}/.env" ]; then
        error ".env file not found"
    fi

    # List of secrets to create. SMTP_USER/SMTP_PASS power email verification —
    # set them in .env (Gmail app password or Morgan SMTP) before deploying, or
    # they'll be skipped with a warning and email verification won't work.
    SECRETS=("JWT_SECRET" "ADMIN_EMAIL" "ADMIN_PASSWORD" "RESEARCH_SECRET" "SMTP_USER" "SMTP_PASS")

    for SECRET_NAME in "${SECRETS[@]}"; do
        SECRET_VALUE=$(grep "^${SECRET_NAME}=" "${SCRIPT_DIR}/.env" | cut -d'=' -f2-)

        if [ -z "$SECRET_VALUE" ]; then
            warn "Secret ${SECRET_NAME} not found in .env, skipping..."
            continue
        fi

        # Create or update secret
        if gcloud secrets describe ${SECRET_NAME} >/dev/null 2>&1; then
            log "Updating secret: ${SECRET_NAME}"
            echo -n "${SECRET_VALUE}" | gcloud secrets versions add ${SECRET_NAME} --data-file=-
        else
            log "Creating secret: ${SECRET_NAME}"
            echo -n "${SECRET_VALUE}" | gcloud secrets create ${SECRET_NAME} --data-file=-
        fi

        # Grant access to backend service account
        gcloud secrets add-iam-policy-binding ${SECRET_NAME} \
            --member="serviceAccount:csnavigator-backend@${PROJECT_ID}.iam.gserviceaccount.com" \
            --role="roles/secretmanager.secretAccessor" \
            --quiet
    done

    log "Secrets configured"
}

# =============================================================================
# IAM Setup (one-time)
# =============================================================================
setup_iam() {
    log "Setting up IAM permissions..."

    # Create service account if not exists
    if ! gcloud iam service-accounts describe \
        "csnavigator-backend@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
        log "Creating service account..."
        gcloud iam service-accounts create csnavigator-backend \
            --display-name="CSNavigator Backend"
    fi

    SA_EMAIL="csnavigator-backend@${PROJECT_ID}.iam.gserviceaccount.com"

    # Grant necessary roles
    ROLES=(
        "roles/aiplatform.user"
        "roles/discoveryengine.viewer"
        "roles/storage.objectViewer"
        "roles/secretmanager.secretAccessor"
        "roles/run.invoker"
    )

    for ROLE in "${ROLES[@]}"; do
        log "Granting ${ROLE}..."
        gcloud projects add-iam-policy-binding ${PROJECT_ID} \
            --member="serviceAccount:${SA_EMAIL}" \
            --role="${ROLE}" \
            --quiet
    done

    # Allow backend to invoke ADK service
    gcloud run services add-iam-policy-binding ${ADK_SERVICE} \
        --region=${REGION} \
        --member="serviceAccount:${SA_EMAIL}" \
        --role="roles/run.invoker" \
        --quiet 2>/dev/null || true

    log "IAM configured"
}

# =============================================================================
# Quick Deploy (rebuild and redeploy changed services)
# =============================================================================
quick_deploy() {
    local service=$1

    case $service in
        backend)
            build_backend
            deploy_backend
            ;;
        frontend)
            build_frontend
            deploy_frontend
            ;;
        adk)
            build_adk
            deploy_adk
            ;;
        *)
            error "Unknown service: $service"
            ;;
    esac
}

# =============================================================================
# Full Deploy (all services)
# =============================================================================
deploy_all() {
    log "========================================="
    log "Starting full deployment to Cloud Run..."
    log "========================================="

    check_prerequisites
    setup_artifact_registry

    # Build all images
    build_adk
    build_backend

    # Deploy in order (ADK first, then backend, then frontend)
    deploy_adk
    setup_iam
    deploy_backend

    # Build frontend with backend URL
    build_frontend
    deploy_frontend

    log "========================================="
    log "Deployment complete!"
    log "========================================="
    log "Frontend: $(cat ${SCRIPT_DIR}/.frontend-url 2>/dev/null || echo 'N/A')"
    log "Backend:  $(cat ${SCRIPT_DIR}/.backend-url 2>/dev/null || echo 'N/A')"
    log "ADK:      $(cat ${SCRIPT_DIR}/.adk-url 2>/dev/null || echo 'N/A')"
    log "========================================="
}

# =============================================================================
# Status Check
# =============================================================================
status() {
    log "Cloud Run Services Status:"
    echo ""

    for SERVICE in ${ADK_SERVICE} ${BACKEND_SERVICE} ${FRONTEND_SERVICE}; do
        URL=$(gcloud run services describe ${SERVICE} \
            --region=${REGION} \
            --format='value(status.url)' 2>/dev/null || echo "NOT DEPLOYED")
        echo "  ${SERVICE}: ${URL}"
    done
    echo ""
}

# =============================================================================
# Main
# =============================================================================
main() {
    local command=${1:-all}

    case $command in
        all)
            deploy_all
            ;;
        backend)
            check_prerequisites
            quick_deploy backend
            ;;
        frontend)
            check_prerequisites
            quick_deploy frontend
            ;;
        adk)
            check_prerequisites
            setup_artifact_registry
            quick_deploy adk
            ;;
        setup)
            check_prerequisites
            setup_artifact_registry
            setup_secrets
            setup_iam
            ;;
        secrets)
            check_prerequisites
            setup_secrets
            ;;
        status)
            status
            ;;
        *)
            echo "Usage: $0 [all|backend|frontend|adk|setup|secrets|status]"
            echo ""
            echo "Commands:"
            echo "  all       - Deploy all services (default)"
            echo "  backend   - Build and deploy backend only"
            echo "  frontend  - Build and deploy frontend only"
            echo "  adk       - Build and deploy ADK agent only"
            echo "  setup     - One-time setup (Artifact Registry, Secrets, IAM)"
            echo "  secrets   - Update secrets from .env file"
            echo "  status    - Show deployment status"
            exit 1
            ;;
    esac
}

main "$@"
