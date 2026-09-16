"""Senhas que aparecem no topo dos vazamentos (e variações em português).

Não é uma regra de complexidade: é a recomendação do NIST SP 800-63B de recusar senhas
conhecidas, que são as primeiras testadas em ataques de força bruta e credential stuffing.
"""

from __future__ import annotations

import re

_COMMON = """
12345678 123456789 1234567890 12345678910 87654321 11111111 00000000 12341234 11223344 123123123
123321123 147258369 159753456 741852963 963852741 qwertyui qwertyuiop asdfghjk asdfghjkl zxcvbnm1
1q2w3e4r 1q2w3e4r5t q1w2e3r4 qwerty123 abc12345 abcd1234 a1b2c3d4 password password1 password123
passw0rd p@ssw0rd iloveyou princess sunshine football baseball superman batman123 starwars dragon12
welcome1 letmein1 monkey12 master12 trustno1 whatever michael1 charlie1 shadow12 computer internet
senha123 senha1234 senhasenha minhasenha mudar123 trocar123 admin123 administrador brasil123
brasil2024 brasil2025 brasil2026 flamengo corinthians palmeiras saopaulo vasco123 gremio123
cruzeiro santos123 botafogo 102030405060 10203040 abc123456 amor1234 teamo123 deusefiel jesus123
jesuscristo meuamor1 familia1 gabriel1 fernanda juliana1 carolina lucas123 mateus123 pedro123
fireshot fireshot1 fireshot123 defesaderede cyberseguranca seguranca
"""
COMMON_PASSWORDS = frozenset(_COMMON.split())


def is_common_password(password: str, *, identifiers: tuple[str, ...] = ()) -> bool:
    """Senha conhecida, repetição de um único caractere ou igual a um identificador da conta."""
    lowered = password.strip().lower()
    if lowered in COMMON_PASSWORDS:
        return True
    if re.fullmatch(r"(.)\1*", lowered):
        return True
    # "lokan" → "lokan123" também conta: o identificador é público (username) ou fácil de achar
    for ident in identifiers:
        ident = ident.strip().lower()
        if len(ident) >= 3 and lowered.rstrip("0123456789!@#$%&*._-") == ident:
            return True
    return False
