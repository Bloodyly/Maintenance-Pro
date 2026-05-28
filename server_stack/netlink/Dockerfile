FROM python:3.10-slim

WORKDIR /app

# Install system dependencies needed for cryptographic packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create shared_db path inside container
RUN mkdir -p /shared_db

COPY . .

EXPOSE 3000

CMD ["python", "main.py"]
