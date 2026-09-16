# API do Fireshot como Vercel Function em container (OCI).
# Um container é necessário por causa do WeasyPrint: o PDF do certificado precisa de
# cairo/pango/gdk-pixbuf, bibliotecas nativas que o runtime Python do Vercel não traz.
#
# Regras do Vercel que este arquivo respeita:
#  - escuta em $PORT (padrão 80);
#  - sem estado em disco (o banco é o Postgres gerenciado);
#  - migrações NÃO rodam aqui (o container escala a zero e subiria concorrente):
#    `alembic upgrade head` é executado no deploy, fora da imagem.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PORT=80

RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
      libffi8 shared-mime-info fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /uvx /usr/local/bin/

WORKDIR /srv
COPY apps/api/pyproject.toml apps/api/uv.lock ./
RUN uv sync --frozen --no-dev

COPY apps/api/app app
COPY packages/content /srv/packages/content

ENV PATH="/srv/.venv/bin:$PATH"

EXPOSE 80
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-80} --proxy-headers --forwarded-allow-ips='*'"]
