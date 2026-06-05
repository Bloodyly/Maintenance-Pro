FROM alpine:3.18

# Install Samba utilities
RUN apk add --no-cache samba samba-common-tools bash

# Copy custom config & startup script
COPY smb.conf /etc/samba/smb.conf
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 139 445

CMD ["/usr/local/bin/entrypoint.sh"]
