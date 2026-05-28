FROM alpine:3.18

# Install Samba utilities
RUN apk add --no-cache samba samba-common-tools bash

# Copy custom config
COPY smb.conf /etc/samba/smb.conf

# Setup directory structures
RUN mkdir -p /samba_shares/Melderlisten \
    && mkdir -p /samba_shares/Protokolle \
    && mkdir -p /samba_shares/Archiv \
    && chmod -R 777 /samba_shares

EXPOSE 139 445

# Start smbd and nmbd processes in foreground
CMD ["smbd", "--foreground", "--no-process-group", "--log-stdout"]
