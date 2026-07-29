# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM golang:1.24-bookworm AS wrapper-builder

WORKDIR /src
COPY go.mod main.go main_test.go ./
RUN go test ./...
ARG TARGETOS=linux
ARG TARGETARCH=amd64
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/voicevox-wrapper .

FROM --platform=linux/amd64 voicevox/voicevox_engine:cpu-0.25.1@sha256:0434decfca36449b6ade271b5d970e880a875f0806b86acb31830624d2830412

USER root
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
COPY --from=wrapper-builder /out/voicevox-wrapper /usr/local/bin/voicevox-wrapper

ENV PORT=8080 \
    VOICEVOX_ENGINE_PATH=/opt/voicevox_engine/run \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    VV_CPU_NUM_THREADS=1

USER user
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/voicevox-wrapper"]
