FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

# Pre-download VAD / turn-detection model files so cold starts stay fast.
RUN python -m voice_agent.main download-files || true

RUN useradd -m agent && chown -R agent:agent /app
USER agent

CMD ["python", "-m", "voice_agent.main", "start"]
