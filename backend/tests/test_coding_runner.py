from coding_runner import (
    RUN_MAX_OUTPUT_CHARS,
    check_practice_run_rate_limit,
    run_javascript_practice_tests,
    run_python_practice_tests,
)
from pathlib import Path
import json


COUNT_VOWELS_TESTS = [
    {"name": "lowercase word", "args": ["hello"], "expected": 2},
    {"name": "mixed case sentence", "args": ["Morgan State"], "expected": 4},
]


def test_python_runner_passes_correct_solution():
    code = """
def count_vowels(text: str) -> int:
    return sum(1 for char in text.lower() if char in "aeiou")
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert result["passed"] == 2
    assert result["total"] == 2


def test_python_runner_fails_incorrect_solution():
    code = """
def count_vowels(text: str) -> int:
    return 0
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "failed"
    assert result["passed"] < result["total"]
    assert any(not item["passed"] for item in result["tests"])


def test_python_runner_outputs_final_function_call():
    code = """
def count_vowels(text: str) -> int:
    return sum(1 for char in text.lower() if char in "aeiou")

count_vowels("hello")
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert result["stdout"].strip() == "2"


def test_javascript_runner_passes_correct_solution():
    code = """
function countVowels(text) {
  return [...text.toLowerCase()].filter((char) => "aeiou".includes(char)).length;
}
"""

    result = run_javascript_practice_tests(code, "countVowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert result["passed"] == 2
    assert result["total"] == 2


def test_javascript_runner_outputs_final_function_call():
    code = """
function countVowels(text) {
  return [...text.toLowerCase()].filter((char) => "aeiou".includes(char)).length;
}

countVowels("hello");
"""

    result = run_javascript_practice_tests(code, "countVowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert result["stdout"].strip() == "2"


def test_javascript_runner_supports_const_arrow_functions():
    code = """
const countVowels = (text) => {
  return [...text.toLowerCase()].filter((char) => "aeiou".includes(char)).length;
};
"""

    result = run_javascript_practice_tests(code, "countVowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert result["passed"] == 2


def test_javascript_runner_supports_order_insensitive_tests():
    code = """
function groupAnagrams(words) {
  return [["tan"], ["tea", "ate", "eat"]];
}
"""
    tests = [{
        "name": "groups can be returned in any order",
        "args": [["eat", "tea", "tan", "ate"]],
        "expected": [["eat", "tea", "ate"], ["tan"]],
        "order_insensitive": True,
    }]

    result = run_javascript_practice_tests(code, "groupAnagrams", tests)

    assert result["status"] == "passed"


def test_javascript_runner_reports_missing_function():
    code = "const value = 42;"

    result = run_javascript_practice_tests(code, "countVowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "error"
    assert "countVowels" in result["stderr"]


def test_all_javascript_practice_questions_have_executable_tests():
    answers_path = Path(__file__).resolve().parents[1] / "data_sources" / "quiz" / "answers" / "javascript.json"
    data = json.loads(answers_path.read_text(encoding="utf-8"))

    missing = [
        item.get("question_id")
        for item in data.get("items", [])
        if not item.get("runner_tests")
    ]

    assert missing == []


def test_javascript_practice_runner_tests_have_expected_shape():
    answers_path = Path(__file__).resolve().parents[1] / "data_sources" / "quiz" / "answers" / "javascript.json"
    data = json.loads(answers_path.read_text(encoding="utf-8"))

    malformed = []
    for item in data.get("items", []):
        for index, test in enumerate(item.get("runner_tests") or [], start=1):
            if "args" not in test or "expected" not in test:
                malformed.append(f"{item.get('question_id')} test {index}")

    assert malformed == []


def test_python_runner_allows_safe_standard_library_imports():
    code = """
from typing import Iterable
import math

def count_vowels(text: str) -> int:
    values: Iterable[str] = text.lower()
    return math.floor(sum(1 for char in values if char in "aeiou"))
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"


def test_python_runner_blocks_filesystem_and_process_access():
    for code in (
        "import os\ndef count_vowels(text):\n    return 0",
        "def count_vowels(text):\n    return open('/etc/passwd').read()",
        "def count_vowels(text):\n    return ().__class__.__mro__",
    ):
        result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

        assert result["status"] == "error"
        assert "security check blocked" in result["stderr"].lower()


def test_python_runner_does_not_expose_imported_module_internals():
    code = """
import typing

leaked_runtime = typing.sys

def count_vowels(text: str) -> int:
    return 0
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "error"
    assert "has no attribute 'sys'" in result["stderr"]


def test_javascript_runner_blocks_runtime_and_constructor_access():
    for code in (
        "const fs = require('fs'); function countVowels() { return 0; }",
        "function countVowels() { return process.env; }",
        "function countVowels() { return this.constructor.constructor('return process')(); }",
    ):
        result = run_javascript_practice_tests(code, "countVowels", COUNT_VOWELS_TESTS)

        assert result["status"] == "error"
        assert "security check blocked" in result["stderr"].lower()


def test_javascript_vm_disables_computed_constructor_escape():
    code = """
function probeSandbox() {
  try {
    return this["con" + "structor"]["con" + "structor"]("return pro" + "cess")()
      ? "escaped"
      : "blocked";
  } catch (_error) {
    return "blocked";
  }
}
"""
    tests = [{"name": "constructor escape", "args": [], "expected": "blocked"}]

    result = run_javascript_practice_tests(code, "probeSandbox", tests)

    assert result["status"] == "passed"


def test_python_runner_caps_student_output():
    code = """
def count_vowels(text: str) -> int:
    print("x" * 20000)
    return sum(1 for char in text.lower() if char in "aeiou")
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "passed"
    assert len(result["stdout"]) <= RUN_MAX_OUTPUT_CHARS + 100
    assert "output truncated" in result["stdout"]


def test_python_runner_terminates_infinite_loop():
    code = """
def count_vowels(text: str) -> int:
    while True:
        pass
"""

    result = run_python_practice_tests(code, "count_vowels", COUNT_VOWELS_TESTS)

    assert result["status"] == "error"
    assert "timed out" in result["stderr"].lower()


def test_runner_rate_limit_returns_retry_after():
    user_key = f"test-user-{id(object())}"

    assert check_practice_run_rate_limit(user_key, limit=2, window_seconds=60) is None
    assert check_practice_run_rate_limit(user_key, limit=2, window_seconds=60) is None
    retry_after = check_practice_run_rate_limit(user_key, limit=2, window_seconds=60)

    assert isinstance(retry_after, int)
    assert retry_after >= 1
