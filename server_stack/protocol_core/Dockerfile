FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create folders for database and samba mounts inside container
RUN mkdir -p /shared_db /samba_shares/Melderlisten /samba_shares/Protokolle /samba_shares/Archiv

COPY . .

CMD ["python", "worker.py"]
