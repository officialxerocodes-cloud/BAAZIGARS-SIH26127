FROM python:3.11-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ingest/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY ingest ./ingest
ENV PYTHONPATH=/app
EXPOSE 8000
CMD ["uvicorn", "ingest.app:app", "--host", "0.0.0.0", "--port", "8000"]
