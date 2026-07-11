# LabourMarket.ai self-hosted transcription service
# whisper.cpp + ffmpeg + a zero-dependency node wrapper (server.mjs).
#
# Build (small model, good multilingual balance for LT/EN/RU/NL/DE):
#   docker build -t lmai-transcribe --build-arg WHISPER_MODEL=small .
# Model options: tiny (75MB, weak), base (142MB), small (466MB, recommended
# minimum for LT), medium (1.5GB, better LT/RU), large-v3-turbo (1.6GB, best).

FROM debian:bookworm-slim AS build
ARG WHISPER_VERSION=v1.7.4
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${WHISPER_VERSION} \
      https://github.com/ggml-org/whisper.cpp /src
WORKDIR /src
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF && \
    cmake --build build -j"$(nproc)" --target whisper-cli
ARG WHISPER_MODEL=small
RUN bash ./models/download-ggml-model.sh ${WHISPER_MODEL} && \
    mv ./models/ggml-${WHISPER_MODEL}.bin /ggml-model.bin

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg nodejs ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    useradd -r -u 10001 transcribe
COPY --from=build /src/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=build /ggml-model.bin /models/ggml-model.bin
COPY server.mjs /app/server.mjs

USER transcribe
ENV PORT=8085 \
    WHISPER_MODEL_PATH=/models/ggml-model.bin \
    WHISPER_BIN=whisper-cli
EXPOSE 8085
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8085)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "/app/server.mjs"]
