# Jagora backend: FastAPI + Playwright Chromium + ffmpeg
FROM mcr.microsoft.com/playwright/python:v1.63.0-noble
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-noto-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY pyproject.toml ./
COPY jagora ./jagora
COPY portals ./portals
RUN pip install --break-system-packages . "uvicorn[standard]"
RUN useradd -m jagora && mkdir -p /app/data /app/runs && chown -R jagora /app
USER jagora
EXPOSE 8000
CMD ["uvicorn", "jagora.server:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
