"""Conformidade TS ↔ Python dos geradores de questões.

As fixtures vêm de packages/content/fixtures/generators (geradas pelo vitest com UPDATE_FIXTURES=1).
Se este teste falhar, cliente e servidor discordariam sobre o gabarito de alguma questão.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import pytest

from app.config import REPO_ROOT
from app.services.content import load_content
from app.terminals.check import check_answer
from app.terminals.generators import generate_question
from app.terminals.rng import fnv1a32, mulberry32, question_seed

FIXTURES = REPO_ROOT / "packages" / "content" / "fixtures" / "generators"
POOLS = load_content(REPO_ROOT / "packages" / "content").pools


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def fixture_files() -> list[Path]:
    files = sorted(p for p in FIXTURES.glob("*.json") if p.name != "rng.json")
    assert files, f"fixtures ausentes em {FIXTURES}: rode UPDATE_FIXTURES=1 pnpm --filter @fireshot/content test"
    return files


def test_rng_matches_typescript() -> None:
    data = json.loads((FIXTURES / "rng.json").read_text(encoding="utf-8"))
    for seq in data["sequences"]:
        rng = mulberry32(seq["seed"])
        assert [rng.next() for _ in seq["next"]] == seq["next"], f"mulberry32 divergiu na seed {seq['seed']}"

    rng = mulberry32(7)
    ops = data["ops"]
    assert [rng.int(-5, 17) for _ in ops["int"]] == ops["int"]
    assert [rng.pick(["a", "b", "c", "d"]) for _ in ops["pick"]] == ops["pick"]
    assert rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8]) == ops["shuffle"]
    assert rng.sample([10, 20, 30, 40, 50], 3) == ops["sample"]
    assert [rng.chance(0.3) for _ in ops["chance"]] == ops["chance"]

    for case in data["fnv1a32"]:
        assert fnv1a32(case["input"]) == case["hash"], f"fnv1a32 divergiu em {case['input']!r}"
    for case in data["questionSeed"]:
        assert question_seed(case["sessionSeed"], case["terminalId"], case["challengeIndex"], case["attemptNo"]) == case["seed"]


@pytest.mark.parametrize("path", fixture_files(), ids=lambda p: p.stem)
def test_generator_matches_typescript(path: Path) -> None:
    data = json.loads(path.read_text(encoding="utf-8"))
    generator, params = data["generator"], data["params"]

    for sample in data["samples"]:
        produced = generate_question(generator, params, sample["seed"], POOLS)
        assert canonical_json(produced) == canonical_json(sample["question"]), (
            f"{data['source']} seed {sample['seed']}: questão diferente do TypeScript"
        )
        for case in sample["checks"]:
            result = check_answer(produced, case["answer"])
            assert result.as_dict() == case["result"], (
                f"{data['source']} seed {sample['seed']}: veredito diferente para {case['answer']!r}"
            )

    for entry in data["seeds"]:
        produced = generate_question(generator, params, entry["seed"], POOLS)
        assert sha256(canonical_json(produced)) == entry["sha256"], (
            f"{data['source']} seed {entry['seed']}: hash diferente do TypeScript"
        )
