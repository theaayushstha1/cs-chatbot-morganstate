FROM python:3.11-slim

# Runtimes/compilers for the Coding Tutor sandbox:
#   nodejs       -> JavaScript runner
#   g++          -> C++ runner (also pulled in by build-essential, kept explicit)
#   default-jdk  -> Java runner (javac + java)
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gcc g++ libffi-dev build-essential default-mysql-client nodejs default-jdk \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY requirements.txt .
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

RUN groupadd --system csnavigator \
 && useradd --system --gid csnavigator --home-dir /app/backend --shell /usr/sbin/nologin csnavigator

COPY --chown=csnavigator:csnavigator . /app/backend
RUN mkdir -p /app/backend/uploads \
 && chown -R csnavigator:csnavigator /app/backend/uploads

USER csnavigator

EXPOSE 5000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
