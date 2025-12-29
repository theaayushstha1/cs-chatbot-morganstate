# 🐻 CS Navigator - Morgan State University

An AI-powered RAG (Retrieval-Augmented Generation) chatbot designed to assist Computer Science students at Morgan State University. This system helps students navigate course requirements, find resources, and get instant answers to academic queries.

## 🚀 Features
- **Cloud Database:** Fully integrated with AWS RDS (MySQL) for secure, persistent data storage.
- **AI Engine:** Uses OpenAI & Pinecone Vector Database for intelligent document retrieval.
- **Secure Authentication:** JWT-based login and signup system.
- **Dockerized:** One-command deployment using Docker Compose.

## 🛠️ Tech Stack
- **Frontend:** React (Vite) + Tailwind CSS
- **Backend:** Python (FastAPI)
- **Database:** AWS RDS (MySQL)
- **Vector DB:** Pinecone
- **DevOps:** Docker & AWS EC2

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone [https://github.com/theaayushstha1/cs-chatbot-morganstate.git](https://github.com/theaayushstha1/cs-chatbot-morganstate.git)
cd cs-chatbot-morganstate
2. Configure Environment Variables
Create a .env file in the root directory and add your keys:

Bash

DATABASE_URL=mysql+pymysql://user:password@aws-endpoint...
OPENAI_API_KEY=your_key_here
PINECONE_API_KEY=your_key_here
VITE_API_BASE_URL=http://localhost:5000
3. Run with Docker
Bash

docker compose up --build
The application will be live at:

Frontend: http://localhost:3000

Backend Docs: http://localhost:5000/docs

👥 Contributors
Aayush Shrestha - Cloud Architecture & Backend Integration

Sakina Shrestha - Initial Core Development

Computer Science Department - Morgan State University

📄 License
This project is licensed under the MIT License - see the LICENSE file for details.