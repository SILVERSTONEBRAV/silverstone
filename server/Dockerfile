FROM rust:1-slim-bookworm AS builder
WORKDIR /workspace

COPY Cargo.toml Cargo.lock ./
COPY server/Cargo.toml server/Cargo.toml
COPY server/src server/src

RUN cargo build --release -p silverstone-server

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /workspace/target/release/silverstone-server /usr/local/bin/silverstone-server

ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/silverstone-server"]
