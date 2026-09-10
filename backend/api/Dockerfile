FROM python:3.11-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY api/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY api ./api
ENV PYTHONPATH=/app
EXPOSE 8002
CMD ["uvicorn", "api.app:app", "--host", "0.0.0.0", "--port", "8002"]
