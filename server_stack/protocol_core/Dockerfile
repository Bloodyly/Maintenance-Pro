FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create folders for database and samba mounts inside container
RUN mkdir -p /shared_db /samba_shares/Melderlisten /samba_shares/Protokolle /samba_shares/Archiv

COPY . .

# Internal-only API for the WebUI's "Druck Blanko" button (synchronous PDF
# generation) -- reachable from other containers on internal_lan by service
# name, never published to the host.
EXPOSE 5001

CMD ["python", "worker.py"]
