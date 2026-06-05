#!/bin/bash
set -e

echo "Samba container starting up..."

# Ensure the root mount folder exists
mkdir -p /samba_shares

# Create subfolders for default tenants if they do not exist
echo "Initializing tenant directories..."
mkdir -p /samba_shares/tenant-1/Melderlisten
mkdir -p /samba_shares/tenant-1/Protokolle
mkdir -p /samba_shares/tenant-1/Archiv

mkdir -p /samba_shares/tenant-2/Melderlisten
mkdir -p /samba_shares/tenant-2/Protokolle
mkdir -p /samba_shares/tenant-2/Archiv

# Adjust permissions so we don't have permission blocks inside the container
chmod -R 777 /samba_shares

echo "Directories created/verified. Launching Samba daemon..."
exec smbd --foreground --no-process-group --log-stdout
