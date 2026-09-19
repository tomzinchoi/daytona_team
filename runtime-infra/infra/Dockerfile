# Build once, push, register by digest, and reuse one immutable Daytona snapshot.
FROM node:22-bookworm-slim AS build
ARG LLAMA_CPP_COMMIT=b23701f77d47dad9de834d59ebfcbe25c9e8b46f
RUN apt-get update && apt-get install -y --no-install-recommends git cmake build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git init /src/llama && cd /src/llama && git remote add origin https://github.com/ggml-org/llama.cpp.git && git fetch --depth 1 origin "$LLAMA_CPP_COMMIT" && git checkout --detach FETCH_HEAD
RUN cmake -S /src/llama -B /src/llama/build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_CUDA=OFF -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF && cmake --build /src/llama/build --target llama-server -j 4

FROM node:22-bookworm-slim
ARG LLAMA_CPP_COMMIT=b23701f77d47dad9de834d59ebfcbe25c9e8b46f
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates libgomp1 && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash daytona && mkdir -p /opt/models /opt/llama/bin
COPY --from=build /src/llama/build/bin/llama-server /opt/llama/bin/llama-server
COPY models/*.gguf /opt/models/
COPY infra/model-manifest.py /tmp/model-manifest.py
RUN python3 /tmp/model-manifest.py "$LLAMA_CPP_COMMIT" && chmod -R a-w /opt/models /opt/llama
USER daytona
WORKDIR /home/daytona
CMD ["sleep", "infinity"]
