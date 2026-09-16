"""Normalização da URL do banco (provedores gerenciados entregam formato libpq)."""

from __future__ import annotations

from app.config import normalize_database_url


def test_keeps_sqlalchemy_urls_untouched() -> None:
    url = "postgresql+asyncpg://u:p@localhost:5432/db"
    assert normalize_database_url(url) == url


def test_neon_pooled_url() -> None:
    raw = "postgresql://u:p@ep-x-pooler.c-2.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require"
    out = normalize_database_url(raw)
    assert out.startswith("postgresql+asyncpg://u:p@ep-x-pooler.c-2.us-east-1.aws.neon.tech/neondb?")
    assert "channel_binding" not in out
    assert "sslmode" not in out
    assert "ssl=require" in out
    # PgBouncer em modo transação não suporta prepared statements nomeados
    assert "prepared_statement_cache_size=0" in out


def test_direct_url_gets_ssl_but_no_statement_flag() -> None:
    out = normalize_database_url("postgres://u:p@ep-x.aws.neon.tech/neondb")
    assert out.startswith("postgresql+asyncpg://")
    assert "ssl=require" in out
    assert "prepared_statement_cache_size" not in out


def test_local_url_stays_without_ssl() -> None:
    out = normalize_database_url("postgresql://fireshot:fireshot@localhost:55432/fireshot")
    assert out == "postgresql+asyncpg://fireshot:fireshot@localhost:55432/fireshot"


def test_other_schemes_are_left_alone() -> None:
    assert normalize_database_url("sqlite:///x.db") == "sqlite:///x.db"
    assert normalize_database_url("") == ""
