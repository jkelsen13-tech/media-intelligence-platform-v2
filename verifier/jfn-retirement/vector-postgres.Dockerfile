# Disposable J1 PostgreSQL dependency preparation; runtime stays on pinned PG 17.6.
ARG PG_BASE=postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929
FROM ${PG_BASE} AS vector_build
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates git build-essential postgresql-server-dev-17; \
    test -x /usr/lib/postgresql/17/bin/pg_config; \
    case "$(/usr/lib/postgresql/17/bin/pg_config --version)" in 'PostgreSQL 17.'*) ;; *) exit 1 ;; esac; \
    git clone --depth 1 --branch v0.8.2 https://github.com/pgvector/pgvector.git /tmp/pgvector; \
    test "$(git -C /tmp/pgvector rev-parse HEAD)" = cab9da72c04353f143bb06b42ab70a403daac64a; \
    make -C /tmp/pgvector -j1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config OPTFLAGS=; \
    make -C /tmp/pgvector -j1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config install

FROM ${PG_BASE}
COPY --from=vector_build /usr/lib/postgresql/17/lib/vector.so /usr/lib/postgresql/17/lib/vector.so
COPY --from=vector_build /usr/share/postgresql/17/extension/vector.control /usr/share/postgresql/17/extension/vector.control
COPY --from=vector_build /usr/share/postgresql/17/extension/vector--*.sql /usr/share/postgresql/17/extension/
