# ABOUTME: Asterisk PBX Docker image for SIP trunk testing with Twilio.
# ABOUTME: Based on mlan/asterisk (Alpine), uses envsubst to template pjsip.conf at startup.

FROM mlan/asterisk:latest

USER root

# Install envsubst (via gettext) and ensure CA certs are present
RUN apk add --no-cache gettext ca-certificates openssl

# Copy our config files (overrides defaults)
COPY config/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create directories for TLS certs
RUN mkdir -p /etc/asterisk/tls \
    && chown -R asterisk:asterisk /etc/asterisk/tls

EXPOSE 5060/udp 5061/tcp
EXPOSE 10000-10100/udp

ENTRYPOINT ["/entrypoint.sh"]
CMD ["asterisk", "-fp"]
