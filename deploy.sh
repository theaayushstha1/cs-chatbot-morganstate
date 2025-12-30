#!/bin/bash

#############################################
# CS Navigator - AWS EC2 Deployment Script
# Author: Aayush Shrestha
# Date: December 29, 2025
#############################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="sakina593"
FRONTEND_IMAGE="${DOCKER_USERNAME}/chatbot-frontend"
BACKEND_IMAGE="${DOCKER_USERNAME}/chatbot-backend"
EC2_HOST="18.214.136.155"
EC2_USER="ec2-user"
EC2_KEY="my-ec2-key.pem"
API_URL="http://${EC2_HOST}:5000"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
    exit 1
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    command -v docker >/dev/null 2>&1 || error "Docker is not installed"
    command -v ssh >/dev/null 2>&1 || error "SSH is not installed"
    
    if [ ! -f "$EC2_KEY" ]; then
        error "EC2 key file not found: $EC2_KEY"
    fi
    
    chmod 400 "$EC2_KEY"
    
    if ! docker info >/dev/null 2>&1; then
        error "Docker daemon is not running"
    fi
    
    log "Prerequisites check passed ✓"
}

# Build Docker images
build_images() {
    log "Building Docker images..."
    
    # Build Frontend
    info "Building frontend image..."
    cd frontend
    docker build \
        --build-arg VITE_API_BASE_URL="${API_URL}" \
        --platform linux/amd64 \
        -t "${FRONTEND_IMAGE}:latest" \
        -t "${FRONTEND_IMAGE}:$(date +%Y%m%d-%H%M%S)" \
        . || error "Frontend build failed"
    cd ..
    
    # Build Backend
    info "Building backend image..."
    cd backend
    docker build \
        --platform linux/amd64 \
        -t "${BACKEND_IMAGE}:latest" \
        -t "${BACKEND_IMAGE}:$(date +%Y%m%d-%H%M%S)" \
        . || error "Backend build failed"
    cd ..
    
    log "Docker images built successfully ✓"
}

# Push images to Docker Hub
push_images() {
    log "Pushing images to Docker Hub..."
    
    # Check if logged in
    if ! docker info 2>/dev/null | grep -q "Username: ${DOCKER_USERNAME}"; then
        info "Logging into Docker Hub..."
        docker login || error "Docker login failed"
    fi
    
    docker push "${FRONTEND_IMAGE}:latest" || error "Frontend push failed"
    docker push "${BACKEND_IMAGE}:latest" || error "Backend push failed"
    
    log "Images pushed successfully ✓"
}

# Test SSH connection
test_ssh() {
    log "Testing SSH connection to EC2..."
    
    if ssh -i "$EC2_KEY" -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" "echo 'SSH connection successful'" >/dev/null 2>&1; then
        log "SSH connection test passed ✓"
    else
        error "Cannot connect to EC2 instance. Check security groups and key file."
    fi
}

# Deploy to EC2
deploy_to_ec2() {
    log "Deploying to EC2 instance..."
    
    # Copy docker-compose file
    info "Copying docker-compose.yml to EC2..."
    scp -i "$EC2_KEY" -o StrictHostKeyChecking=no \
        docker-compose.yml "${EC2_USER}@${EC2_HOST}:~/" || error "Failed to copy docker-compose.yml"
    
    # SSH and deploy
    info "Executing deployment commands on EC2..."
    ssh -i "$EC2_KEY" -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" << 'EOF' || error "Deployment failed on EC2"
        set -e
        
        echo "Pulling latest images..."
        docker pull sakina593/chatbot-frontend:latest
        docker pull sakina593/chatbot-backend:latest
        
        echo "Stopping old containers..."
        docker-compose down || true
        
        echo "Removing old images..."
        docker image prune -f
        
        echo "Starting new containers..."
        docker-compose up -d
        
        echo "Waiting for services to start..."
        sleep 5
        
        echo "Checking container status..."
        docker-compose ps
        
        echo "Deployment complete!"
EOF
    
    log "Deployment to EC2 completed successfully ✓"
}

# Main deployment flow
main() {
    echo ""
    log "=========================================="
    log "   CS Navigator Deployment Script"
    log "=========================================="
    echo ""
    
    check_prerequisites
    build_images
    push_images
    test_ssh
    deploy_to_ec2
    
    echo ""
    log "=========================================="
    log "   Deployment Successful! 🚀"
    log "=========================================="
    echo ""
    info "Frontend URL: http://${EC2_HOST}:3000"
    info "Backend URL: http://${EC2_HOST}:5000"
    echo ""
}

# Run main function
main "$@"
