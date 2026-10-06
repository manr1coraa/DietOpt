# Необов'язково: запуск Python-версії з API (FastAPI + PuLP) у Docker.
# Збірка з кореня проєкту:  docker build -f backend/Dockerfile -t dietopt .
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY web web
WORKDIR /app/backend
ENV PORT=8000
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
