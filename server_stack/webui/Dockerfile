FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Mount directories for SQLite and Samba storage inside the container
RUN mkdir -p /shared_db /samba_shares/Melderlisten /samba_shares/Protokolle /samba_shares/Archiv

COPY . .

EXPOSE 8080

CMD ["python", "app.py"]
