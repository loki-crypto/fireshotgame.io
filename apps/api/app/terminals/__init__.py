"""Geradores de questões e verificação de respostas (espelho de packages/sim/src/terminals)."""

from .check import CheckResult, check_answer, effective_allowed
from .generators import GENERATORS, generate_question
from .rng import fnv1a32, mulberry32, question_seed

__all__ = [
    "GENERATORS",
    "CheckResult",
    "check_answer",
    "effective_allowed",
    "fnv1a32",
    "generate_question",
    "mulberry32",
    "question_seed",
]
