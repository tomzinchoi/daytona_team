Place these three compatible, quantized GGUF files here before building the snapshot image:

- `qwen3-4b.gguf` — Qwen3 4B
- `deepseek-r1-distill-qwen-7b.gguf` — DeepSeek-R1-Distill-Qwen-7B
- `gemma-3-4b.gguf` — Gemma 3 4B instruction model, text-only use

Use a consistent quantization, such as Q4_K_M, and record the exact model repository, revision, license acceptance and quantization in your experiment notes. Model binaries are intentionally gitignored and never downloaded by benchmark requests. The image build records the SHA-256 and byte size of each actual file. Renaming a file does not verify its model identity: inspect its source before adding it.

The image includes all competing models so every run uses the same snapshot. Each agent loads only its selected model, releases it after inference, and passes its answer to the next agent. CPU inference may exceed the fixed budget; that is reported as an execution failure.
