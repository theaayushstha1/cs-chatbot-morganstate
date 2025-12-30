# 🐻 CS Navigator - Morgan State University

An AI-powered **RAG (Retrieval-Augmented Generation)** chatbot designed to assist Computer Science students at Morgan State University. This system helps students navigate course requirements, find resources, and get instant answers to academic queries.

---

## 🖼️ Application Preview

![CS Navigator UI Preview](https://i.imgur.com/SFocaTt.png)


## 🚀 Features

- **Cloud Database:** Integrated with AWS RDS (MySQL) for secure, persistent data storage.  
- **AI Engine:** Uses OpenAI and Pinecone Vector Database for intelligent document retrieval.  
- **Secure Authentication:** JWT-based login and signup system.  
- **Dockerized:** One-command deployment using Docker Compose and production-ready images.  

---

## 🛠️ Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS  
- **Backend:** Python (FastAPI)  
- **Database:** AWS RDS (MySQL)  
- **Vector DB:** Pinecone  
- **DevOps:** Docker & AWS EC2  

---

## ⚙️ Installation & Setup

### 1. Clone the Repository

```
git clone https://github.com/theaayushstha1/cs-chatbot-morganstate.git
cd cs-chatbot-morganstate
```

### 2. Configure Environment Variables

Create a `.env` file in the **backend** directory and add your keys (do not commit this file):

```
OPENAI_API_KEY=your_openai_key_here
PINECONE_API_KEY=your_pinecone_key_here
PINECONE_ENV=your_pinecone_env
PINECONE_INDEX_NAME=your_index_name
PINECONE_NAMESPACE=docs
JWT_SECRET=some_long_random_secret
DATABASE_URL=mysql+pymysql://user:password@aws-endpoint:3306/db_name
```

Create a `.env` file in the **frontend** directory:

```
VITE_API_BASE_URL=http://localhost:5000
```

Make sure `.gitignore` is configured so that all `.env` files and key files (like `*.pem`) are never committed.

---

### 3. Run with Docker (Local)

From the project root:

```
docker compose up --build
```

The application will be available at:

- **Frontend:** `http://localhost:3000`  
- **Backend API & Docs:** `http://localhost:5000/docs`  

---

### 4. Production Deployment (AWS EC2)

This project includes helper scripts for smoother deployment:

- `deploy.sh` – builds images, pushes to Docker Hub, and redeploys to an EC2 instance.  
- `quickdeploy.sh` – pulls latest images and restarts containers on EC2.  
- `viewlogs.sh` – streams Docker Compose logs from the EC2 instance.  

Before using them, update the configuration variables inside these scripts:

- `EC2_HOST`
- `EC2_USER`
- `EC2_KEY`
- `DOCKER_USERNAME`

Then:

```
chmod +x deploy.sh quickdeploy.sh viewlogs.sh
./deploy.sh
```

---

## 👥 Contributors

- **Aayush Shrestha** – Cloud Architecture & Backend Integration  
- **Sakina Shrestha** – Initial Core Development  
- **Computer Science Department** – Morgan State University  

---

## 📄 License

This project is licensed under the MIT License – see the [LICENSE](./LICENSE) file for details.
```

