"""Unit tests for matcher identity resolution — no services needed.

Run: .venv-sumo/bin/python -m pytest tests/test_matcher_unit.py -q
"""
import time

from workers.matcher import prune_window, resolve_identity


def test_exact_match_wins():
    cands = {"DL8CAB1234", "DL8CAB1235"}
    assert resolve_identity("DL8CAB1234", cands) == "DL8CAB1234"


def test_one_edit_confusable_merges():
    # OCR misread 1<->I merges into the true identity
    assert resolve_identity("DL8CAB1234", {"DL8CABI234"}) == "DL8CABI234"


def test_far_plate_founds_new_identity():
    assert resolve_identity("MH12AB1234", {"DL8CAB1234"}) is None


def test_tie_break_is_deterministic():
    cands = {"DL8CAB1234", "DL8CAB1235"}
    a = resolve_identity("DL8CAB1230", cands)
    b = resolve_identity("DL8CAB1230", cands)
    assert a == b and a in cands


def test_empty_and_none_safe():
    assert resolve_identity("", {"DL8CAB1234"}) is None


def test_prune_window_drops_stale():
    now = time.time()
    seen = {"fresh": now - 10, "stale": now - 9999}
    prune_window(seen, now, 600)
    assert seen == {"fresh": now - 10}
