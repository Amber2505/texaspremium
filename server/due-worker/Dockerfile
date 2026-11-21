# Texas Premium due-date reminder cloud worker (Railway)
FROM mcr.microsoft.com/playwright/python:v1.49.0-jammy

# Bitwarden CLI (standalone binary, no Node needed)
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip \
 && curl -fsSL "https://vault.bitwarden.com/download/?app=cli&platform=linux" -o /tmp/bw.zip \
 && unzip /tmp/bw.zip -d /usr/local/bin && chmod +x /usr/local/bin/bw && rm /tmp/bw.zip \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker.py .

# Railway volume mounted at /data keeps the Chrome profile (stay signed in),
# Bitwarden's local data and the learned per-site steps across deploys.
ENV DATA_DIR=/data BITWARDENCLI_APPDATA_DIR=/data/bw PYTHONUNBUFFERED=1
CMD ["python", "-u", "worker.py"]
