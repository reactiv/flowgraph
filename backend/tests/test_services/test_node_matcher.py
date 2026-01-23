"""Tests for the node_matcher service."""

from app.models.match import MatchConfidence
from app.services.node_matcher import (
    NodeMatcher,
    _confidence_from_distance,
    _normalize_title,
)


class TestNormalizeTitle:
    """Tests for title normalization."""

    def test_lowercase(self):
        assert _normalize_title("Hello World") == "hello world"

    def test_strip_whitespace(self):
        assert _normalize_title("  hello  ") == "hello"

    def test_collapse_whitespace(self):
        assert _normalize_title("hello   world") == "hello world"

    def test_mixed(self):
        assert _normalize_title("  Hello   World  ") == "hello world"

    def test_empty(self):
        assert _normalize_title("") == ""

    def test_already_normalized(self):
        assert _normalize_title("hello world") == "hello world"


class TestConfidenceFromDistance:
    """Tests for confidence calculation from edit distance."""

    def test_exact_match(self):
        assert _confidence_from_distance(0, 10) == MatchConfidence.EXACT

    def test_short_title_distance_1(self):
        # Short title (<=5 chars), distance 1 = HIGH
        assert _confidence_from_distance(1, 4) == MatchConfidence.HIGH

    def test_short_title_distance_2(self):
        # Short title, distance 2 = MEDIUM
        assert _confidence_from_distance(2, 5) == MatchConfidence.MEDIUM

    def test_short_title_distance_3(self):
        # Short title, distance 3+ = NONE
        assert _confidence_from_distance(3, 5) == MatchConfidence.NONE

    def test_long_title_distance_1(self):
        # Long title, distance 1 = HIGH
        assert _confidence_from_distance(1, 20) == MatchConfidence.HIGH

    def test_long_title_distance_2(self):
        # Long title, distance 2 = HIGH
        assert _confidence_from_distance(2, 20) == MatchConfidence.HIGH

    def test_long_title_distance_3(self):
        # Long title, distance 3-4 = MEDIUM
        assert _confidence_from_distance(3, 20) == MatchConfidence.MEDIUM
        assert _confidence_from_distance(4, 20) == MatchConfidence.MEDIUM

    def test_long_title_distance_5(self):
        # Long title, distance 5+ = NONE (unless within relative threshold)
        assert _confidence_from_distance(5, 20) == MatchConfidence.NONE

    def test_relative_threshold_high(self):
        # 10% of length = HIGH
        assert _confidence_from_distance(5, 50) == MatchConfidence.HIGH

    def test_relative_threshold_medium(self):
        # 20% of length = MEDIUM
        assert _confidence_from_distance(10, 50) == MatchConfidence.MEDIUM


class TestNodeMatcherPropertyDiff:
    """Tests for property diff calculation."""

    def test_no_diff(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {"a": 1, "b": "hello"}
        incoming = {"a": 1, "b": "hello"}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {}

    def test_changed_value(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {"a": 1, "b": "hello"}
        incoming = {"a": 2, "b": "hello"}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {"a": 2}

    def test_new_key(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {"a": 1}
        incoming = {"a": 1, "b": "new"}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {"b": "new"}

    def test_multiple_changes(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {"a": 1, "b": "old"}
        incoming = {"a": 2, "b": "new", "c": True}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {"a": 2, "b": "new", "c": True}

    def test_empty_incoming(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {"a": 1, "b": "hello"}
        incoming = {}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {}

    def test_empty_existing(self):
        matcher = NodeMatcher.__new__(NodeMatcher)
        existing = {}
        incoming = {"a": 1}
        diff = matcher._compute_property_diff(existing, incoming)
        assert diff == {"a": 1}


class TestLevenshteinDistance:
    """Tests for the imported Levenshtein distance function."""

    def test_exact_match(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("hello", "hello") == 0

    def test_one_substitution(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("hello", "hallo") == 1

    def test_one_insertion(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("hello", "helllo") == 1

    def test_one_deletion(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("hello", "helo") == 1

    def test_case_sensitive(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("Hello", "hello") == 1

    def test_empty_strings(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("", "") == 0
        assert _levenshtein_distance("hello", "") == 5
        assert _levenshtein_distance("", "hello") == 5

    def test_completely_different(self):
        from app.llm.transformer.seed_validators import _levenshtein_distance

        assert _levenshtein_distance("abc", "xyz") == 3
