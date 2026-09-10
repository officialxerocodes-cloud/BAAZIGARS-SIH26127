FROM python:3.11-slim
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY workers/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY common ./common
COPY workers ./workers
ENV PYTHONPATH=/app
# Unbuffered logs: worker prints must reach `podman logs` immediately.
# Without this, crashes and flush errors sit in an 8KB buffer and a
# stalled pipeline looks merely "quiet" instead of broken.
ENV PYTHONUNBUFFERED=1
# default command overridden per service in compose
CMD ["python", "-m", "workers.matcher"]
