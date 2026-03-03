# ABOUTME: SIPp container for SIP traffic generation and load testing.
# ABOUTME: Used to test SIP trunk connectivity with scripted call scenarios.

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sip-tester \
    && rm -rf /var/lib/apt/lists/*

COPY scenarios/ /scenarios/

WORKDIR /scenarios

ENTRYPOINT ["sipp"]
