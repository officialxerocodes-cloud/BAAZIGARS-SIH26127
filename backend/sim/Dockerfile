FROM python:3.12-slim
# libsumo links system X11/GL libs even headless — slim lacks them.
# (closure derived via ldd on _libsumo.so; keep in one layer with curl)
RUN apt-get update && apt-get install -y curl \
    libx11-6 libxau6 libxcb1 libxext6 libxrender1 \
    libgl1 libglx-mesa0 libglvnd0 \
    libexpat1 libatomic1 zlib1g \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# eclipse-sumo ships sumo binaries + sumolib/traci/libsumo (~1GB, cached after first build)
RUN pip install --no-cache-dir eclipse-sumo libsumo httpx asyncpg
COPY common ./common
COPY sim ./sim
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV SUMO_HOME=/usr/local/lib/python3.12/site-packages/sumo
# NET_FILE / ROUTES / DET resolve under /data (mounted ./sim/data)
CMD ["python", "-u", "-m", "sim.runner"]
