#!/bin/bash

# --- CONFIGURATION ---
SERVER_USER="ec2-user"
SERVER_IP="18.214.136.155"
KEY_PATH="cs-chatbot-key.pem"

echo "🚀 Starting Deployment to $SERVER_IP (PORT 5000)..."

# 1. Clean local artifacts
rm -f app_bundle.tar.gz

# 2. Package files (Exclude local junk)
echo "📦 Packaging files..."
COPYFILE_DISABLE=1 tar \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='.venv' \
    --exclude='venv' \
    --exclude='backend/.venv' \
    --exclude='__pycache__' \
    --exclude='app_bundle.tar.gz' \
    --exclude='uploads' \
    --exclude='.DS_Store' \
    --exclude='._*' \
    --exclude='frontend/.env*' \
    -czf app_bundle.tar.gz .

if [ ! -f "app_bundle.tar.gz" ]; then
    echo "❌ Packaging failed."
    exit 1
fi

# 3. Upload
echo "Tb Uploading bundle..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no app_bundle.tar.gz "$SERVER_USER@$SERVER_IP:/home/$SERVER_USER/"

if [ $? -ne 0 ]; then
    echo "❌ Upload failed."
    exit 1
fi

# 4. Remote Build & Configure
echo "🔧 Building on server..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_IP" << 'EOF'
    set -e

    echo "🧹 Cleaning old files..."
    sudo rm -rf cs-chatbot
    mkdir -p cs-chatbot
    
    mv app_bundle.tar.gz cs-chatbot/
    cd cs-chatbot
    tar -xzf app_bundle.tar.gz --warning=no-unknown-keyword || true
    rm app_bundle.tar.gz

    # 🔥 GENERATE DOCKER-COMPOSE (Mapping Port 5000)
    echo "⚙️  Generating Docker Config..."
    cat > docker-compose.yml <<DOCKER
version: '3.8'
services:
  backend:
    build: ./backend
    container_name: ec2-user-backend-1
    command: uvicorn main:app --host 0.0.0.0 --port 5000
    ports:
      - "5000:5000"
    env_file: .env
    volumes:
      - ./backend/uploads:/app/backend/uploads

  frontend:
    build: ./frontend
    container_name: ec2-user-frontend-1
    ports:
      - "3000:80"
    depends_on:
      - backend
DOCKER

    # 🔥 FORCE FRONTEND ENV (To point to Port 5000)
    echo "📝 Configuring Frontend for Port 5000..."
    echo "VITE_API_BASE_URL=http://18.214.136.155:5000" > frontend/.env
    echo "VITE_API_URL=http://18.214.136.155:5000" >> frontend/.env

    # Check for Backend Secrets
    if [ ! -f .env ]; then
        echo "❌ ERROR: Root .env file missing! Deployment stopped."
        exit 1
    fi

    # Build and Start
    echo "🏗️  Building Docker..."
    sudo docker-compose down
    sudo docker-compose up --build -d
    sudo docker image prune -a -f 

    echo "✅ Deployment finished successfully!"
EOF

rm app_bundle.tar.gz