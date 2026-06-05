"""Validate data/variables.yaml and data/sources.yaml.

These tests run in CI on every push and PR. They guard the catalogue
schema: malformed entries fail fast.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
VARIABLES_YAML = REPO_ROOT / "data" / "variables.yaml"
SOURCES_YAML = REPO_ROOT / "data" / "sources.yaml"

PRIORITIES = {"must-have", "should-have", "could-have", "would-have"}
DISCIPLINES = {"epi", "soc", "meta"}
CATEGORIES = {
    "spatial",
    "demographics",
    "housing",
    "socio-economic",
    "health",
    "land-use",
    "mobility",
}


@pytest.fixture(scope="module")
def variables() -> list[dict]:
    data = yaml.safe_load(VARIABLES_YAML.read_text(encoding="utf-8"))
    return data["variables"]


@pytest.fixture(scope="module")
def sources() -> list[dict]:
    data = yaml.safe_load(SOURCES_YAML.read_text(encoding="utf-8"))
    return data["sources"]


def test_variables_yaml_loads(variables):
    assert isinstance(variables, list) and len(variables) > 0


def test_sources_yaml_loads(sources):
    assert isinstance(sources, list) and len(sources) > 0


def test_variable_ids_unique(variables):
    ids = [v["id"] for v in variables]
    assert len(ids) == len(set(ids)), "Duplicate variable id in variables.yaml"


def test_source_ids_unique(sources):
    ids = [s["id"] for s in sources]
    assert len(ids) == len(set(ids)), "Duplicate source id in sources.yaml"


def test_variable_required_fields(variables):
    for v in variables:
        for field in ("id", "name", "priority", "category", "discipline", "source"):
            assert field in v, f"Variable {v.get('id', '?')} missing field {field!r}"
        assert v["priority"] in PRIORITIES, f"{v['id']}: bad priority {v['priority']}"
        assert v["category"] in CATEGORIES, f"{v['id']}: bad category {v['category']}"
        assert v["discipline"] in DISCIPLINES, f"{v['id']}: bad discipline {v['discipline']}"


def test_variable_sources_resolve(variables, sources):
    source_ids = {s["id"] for s in sources}
    for v in variables:
        assert v["source"] in source_ids, (
            f"Variable {v['id']} references unknown source {v['source']!r}"
        )


def test_source_required_fields(sources):
    for s in sources:
        for field in ("id", "name", "provider", "kind", "url", "licence"):
            assert field in s, f"Source {s.get('id', '?')} missing field {field!r}"
        assert s["url"].startswith("http"), f"{s['id']}: url must be absolute"


def test_must_have_coverage(variables):
    """The challenge brief defines a non-empty must-have set."""
    must = [v for v in variables if v["priority"] == "must-have"]
    assert len(must) >= 10, (
        "Expected at least 10 must-have variables per the challenge spreadsheet."
    )
