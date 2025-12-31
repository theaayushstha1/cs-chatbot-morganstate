#!/bin/bash
set -euo pipefail

EC2_HOST="18.214.136.155"
EC2_USER="ec2-user"
EC2_KEY="cs-chatbot-key.pem"

echo "🚀 Quick deployment (pull and restart)..."

ssh -i "$EC2_KEY" "${EC2_USER}@${EC2_HOST}" << 'EOF'
    cd ~
    docker-compose pull
    docker-compose down
    docker-compose up -d
    docker-compose ps
EOF

echo "✅ Quick deployment complete!"
echo "🌐 Frontend: http://18.214.136.155:3000"
