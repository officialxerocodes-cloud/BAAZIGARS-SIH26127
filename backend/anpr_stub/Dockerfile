FROM python:3.11-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY anpr_stub/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY anpr_stub ./anpr_stub
ENV PYTHONPATH=/app
EXPOSE 8001
CMD ["uvicorn", "anpr_stub.app:app", "--host", "0.0.0.0", "--port", "8001"]
