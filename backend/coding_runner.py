import ast
import json
import hashlib
import math
import os
import re
import signal
import subprocess
import sys
import tempfile
import time
from collections import defaultdict, deque
from typing import Any
from threading import Lock


RUN_RESULT_CACHE_TTL_SECONDS = 600
RUN_RESULT_CACHE_MAX_SIZE = 200
RUN_TIMEOUT_SECONDS = 4
RUN_MAX_OUTPUT_CHARS = 12000
RUN_MAX_VALUE_CHARS = 4000
RUN_RATE_LIMIT = 12
RUN_RATE_WINDOW_SECONDS = 60
RUN_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024
RUN_FILE_SIZE_LIMIT_BYTES = 1024 * 1024

PYTHON_ALLOWED_IMPORTS = {
    "bisect",
    "collections",
    "functools",
    "heapq",
    "itertools",
    "math",
    "operator",
    "re",
    "statistics",
    "string",
    "typing",
}
PYTHON_BLOCKED_NAMES = {
    "__builtins__",
    "__import__",
    "breakpoint",
    "compile",
    "delattr",
    "dir",
    "eval",
    "exec",
    "getattr",
    "globals",
    "help",
    "input",
    "locals",
    "open",
    "setattr",
    "vars",
}
PYTHON_BLOCKED_ATTRIBUTES = {
    "connect",
    "fork",
    "kill",
    "popen",
    "remove",
    "rmdir",
    "spawn",
    "system",
    "unlink",
}
JAVASCRIPT_BLOCKED_PATTERNS = (
    (re.compile(r"\brequire\s*\("), "Module loading is not available in the practice runner."),
    (re.compile(r"\bimport\s*(?:\(|[\s{*])"), "Module loading is not available in the practice runner."),
    (re.compile(r"\b(?:process|Deno|Bun)\b"), "Runtime process access is not available in the practice runner."),
    (re.compile(r"\b(?:fetch|WebSocket|XMLHttpRequest)\b"), "Network access is not available in the practice runner."),
    (re.compile(r"(?:__proto__|\bprototype\b|\bconstructor\b)"), "Prototype and constructor access is not available in the practice runner."),
    (re.compile(r"\b(?:eval|Function)\s*\("), "Dynamic code generation is not available in the practice runner."),
)

# Compiled-language guards. Java/C++ are compiled then run, so we block source
# patterns that touch the filesystem, network, processes, or reflection before
# they ever reach the compiler.
JAVA_BLOCKED_PATTERNS = (
    (re.compile(r"\bimport\s+(?!java\.(?:util|lang|math|text)\b)"), "Only java.util, java.lang, java.math, and java.text imports are available in the practice runner."),
    (re.compile(r"\b(?:Runtime|ProcessBuilder|System\s*\.\s*exit)\b"), "Process and runtime access is not available in the practice runner."),
    (re.compile(r"\b(?:java\s*\.\s*io|FileReader|FileWriter|FileInputStream|FileOutputStream|RandomAccessFile|Files)\b"), "File access is not available in the practice runner."),
    (re.compile(r"\b(?:java\s*\.\s*net|Socket|ServerSocket|URL|URLConnection|HttpClient)\b"), "Network access is not available in the practice runner."),
    (re.compile(r"\b(?:java\s*\.\s*lang\s*\.\s*reflect|getClass\s*\(|Class\s*\.\s*forName)\b"), "Reflection is not available in the practice runner."),
    (re.compile(r"\bThread\b|\bRuntime\.getRuntime\b"), "Threads and runtime access are not available in the practice runner."),
)
CPP_BLOCKED_PATTERNS = (
    (re.compile(r"#\s*include\s*<\s*(?:fstream|filesystem)\s*>"), "File stream access is not available in the practice runner."),
    (re.compile(r"\b(?:system|popen|fork|exec[lv][pe]?|remove|rename)\s*\("), "Process and filesystem calls are not available in the practice runner."),
    (re.compile(r"#\s*include\s*<\s*(?:cstdio|stdio\.h)\s*>.*\b(?:fopen|fread|fwrite|freopen)\b", re.DOTALL), "File access is not available in the practice runner."),
    (re.compile(r"\b(?:socket|connect|bind|listen|accept)\s*\("), "Network access is not available in the practice runner."),
    (re.compile(r"\b(?:asm|__asm__|__asm)\b"), "Inline assembly is not available in the practice runner."),
    (re.compile(r"#\s*include\s*<\s*thread\s*>|\bstd\s*::\s*thread\b"), "Threads are not available in the practice runner."),
)

# Compile step gets its own (longer) timeout than execution.
COMPILE_TIMEOUT_SECONDS = 10

_run_result_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_run_result_cache_lock = Lock()
_run_rate_limits: dict[str, deque[float]] = defaultdict(deque)
_run_rate_limit_lock = Lock()


class RunnerSecurityError(ValueError):
    pass


def check_practice_run_rate_limit(
    user_key: str,
    *,
    limit: int = RUN_RATE_LIMIT,
    window_seconds: int = RUN_RATE_WINDOW_SECONDS,
) -> int | None:
    """Return retry-after seconds when a user exceeds the runner limit."""
    now = time.monotonic()
    with _run_rate_limit_lock:
        timestamps = _run_rate_limits[str(user_key)]
        while timestamps and now - timestamps[0] >= window_seconds:
            timestamps.popleft()
        if len(timestamps) >= limit:
            return max(1, math.ceil(window_seconds - (now - timestamps[0])))
        timestamps.append(now)

        if len(_run_rate_limits) > 10000:
            stale_keys = [
                key
                for key, values in _run_rate_limits.items()
                if not values or now - values[-1] >= window_seconds
            ]
            for key in stale_keys:
                _run_rate_limits.pop(key, None)
    return None


def validate_python_code(code: str) -> None:
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise RunnerSecurityError(f"Python syntax error: {exc.msg} (line {exc.lineno}).") from exc

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            modules = []
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif node.module:
                modules = [node.module]
            for module_name in modules:
                root_module = module_name.split(".", 1)[0]
                if root_module not in PYTHON_ALLOWED_IMPORTS:
                    raise RunnerSecurityError(
                        f"Importing '{root_module}' is not available in the practice runner."
                    )
        elif isinstance(node, ast.Name) and node.id in PYTHON_BLOCKED_NAMES:
            raise RunnerSecurityError(
                f"'{node.id}' is not available in the practice runner."
            )
        elif isinstance(node, ast.Attribute):
            if node.attr.startswith("__") or node.attr in PYTHON_BLOCKED_ATTRIBUTES:
                raise RunnerSecurityError(
                    f"Attribute access '{node.attr}' is not available in the practice runner."
                )


def validate_javascript_code(code: str) -> None:
    for pattern, message in JAVASCRIPT_BLOCKED_PATTERNS:
        if pattern.search(code):
            raise RunnerSecurityError(message)


def validate_java_code(code: str) -> None:
    for pattern, message in JAVA_BLOCKED_PATTERNS:
        if pattern.search(code):
            raise RunnerSecurityError(message)


def validate_cpp_code(code: str) -> None:
    for pattern, message in CPP_BLOCKED_PATTERNS:
        if pattern.search(code):
            raise RunnerSecurityError(message)


def _find_executable(*names: str) -> str | None:
    """Return the first available executable from `names`, or None."""
    import shutil
    for name in names:
        path = shutil.which(name)
        if path:
            return path
    return None


def _security_error_response(exc: RunnerSecurityError) -> dict[str, Any]:
    message = f"Runner security check blocked this code: {exc}"
    return {
        "status": "error",
        "tests": [],
        "stdout": "",
        "stderr": message,
        "duration_ms": 0,
    }


def _truncate_text(value: Any, limit: int = RUN_MAX_OUTPUT_CHARS) -> str:
    text = "" if value is None else str(value)
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n... output truncated by CS Navigator ..."


# The JVM reserves a very large VIRTUAL address space at startup (code cache,
# metaspace, thread stacks, mapped libs) — far more than its physical heap — so a
# tight RLIMIT_AS kills javac/java before they run. JVM memory is bounded instead
# by -Xmx on the java command. C++ binaries are fine with the strict AS cap.
def _make_resource_limiter(*, as_bytes: int | None, nofile: int = 16):
    def _apply() -> None:
        if os.name != "posix":
            return
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (5, 6))
        if as_bytes is not None:
            resource.setrlimit(resource.RLIMIT_AS, (as_bytes, as_bytes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (RUN_FILE_SIZE_LIMIT_BYTES, RUN_FILE_SIZE_LIMIT_BYTES))
        resource.setrlimit(resource.RLIMIT_NOFILE, (nofile, nofile))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    return _apply


# Default profile: strict address-space cap (Python/JS/native binaries).
_limit_subprocess_resources = _make_resource_limiter(as_bytes=RUN_MEMORY_LIMIT_BYTES, nofile=16)
# JVM profile: no RLIMIT_AS (JVM self-limits via -Xmx), more file descriptors.
_limit_jvm_resources = _make_resource_limiter(as_bytes=None, nofile=256)


def _subprocess_security_kwargs(limiter=None) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"start_new_session": True}
    if os.name == "posix":
        kwargs["preexec_fn"] = limiter or _limit_subprocess_resources
    return kwargs


def _run_isolated_process(
    command: list[str],
    *,
    cwd: str,
    input_text: str,
    env: dict[str, str],
    limiter=None,
) -> subprocess.CompletedProcess[str]:
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        **_subprocess_security_kwargs(limiter),
    )
    try:
        stdout, stderr = process.communicate(
            input=input_text,
            timeout=RUN_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.communicate()
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def _compile_source(
    command: list[str],
    *,
    cwd: str,
    env: dict[str, str] | None = None,
    limiter=None,
) -> subprocess.CompletedProcess[str]:
    """Compile step for Java/C++. Longer timeout than execution; no stdin."""
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        **_subprocess_security_kwargs(limiter),
    )
    try:
        stdout, stderr = process.communicate(timeout=COMPILE_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.communicate()
        raise
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def _runner_cache_key(question_id: str, language: str, code: str, function_name: str, tests: list[dict[str, Any]]) -> str:
    payload = {
        "question_id": question_id,
        "language": language,
        "code": code,
        "function_name": function_name,
        "tests": tests,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_cached_practice_run(
    question_id: str,
    language: str,
    code: str,
    function_name: str,
    tests: list[dict[str, Any]],
) -> dict[str, Any] | None:
    key = _runner_cache_key(question_id, language, code, function_name, tests)
    now = time.time()
    with _run_result_cache_lock:
        cached = _run_result_cache.get(key)
        if not cached:
            return None
        cached_at, result = cached
        if now - cached_at > RUN_RESULT_CACHE_TTL_SECONDS:
            _run_result_cache.pop(key, None)
            return None
        return {**result, "cached": True}


def set_cached_practice_run(
    question_id: str,
    language: str,
    code: str,
    function_name: str,
    tests: list[dict[str, Any]],
    result: dict[str, Any],
) -> None:
    key = _runner_cache_key(question_id, language, code, function_name, tests)
    cacheable = {
        key: value
        for key, value in result.items()
        if key not in {"progress", "progress_saved", "message", "cached"}
    }
    with _run_result_cache_lock:
        if len(_run_result_cache) >= RUN_RESULT_CACHE_MAX_SIZE:
            oldest_key = min(_run_result_cache, key=lambda item: _run_result_cache[item][0])
            _run_result_cache.pop(oldest_key, None)
        _run_result_cache[key] = (time.time(), cacheable)


def empty_practice_run_response(message: str, status_value: str = "error") -> dict[str, Any]:
    return {
        "status": status_value,
        "passed": 0,
        "total": 0,
        "tests": [],
        "stdout": "",
        "stderr": message,
        "duration_ms": 0,
        "progress_saved": False,
        "message": message,
    }


def run_python_practice_tests(code: str, function_name: str, tests: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        validate_python_code(code)
    except RunnerSecurityError as exc:
        return _security_error_response(exc)

    runner_source = """
import ast
import builtins
import contextlib
import io
import json
import sys
import time
import types

payload = json.loads(sys.stdin.read() or "{}")
tests = payload.get("tests", [])
function_name = payload.get("function_name")
started = time.perf_counter()
stdout_buffer = io.StringIO()
results = []
MAX_OUTPUT_CHARS = 12000
MAX_VALUE_CHARS = 4000
ALLOWED_IMPORTS = {
    "bisect", "collections", "functools", "heapq", "itertools", "math",
    "operator", "re", "statistics", "string", "typing",
}
SAFE_MODULE_CACHE = {}

class CappedTextIO(io.TextIOBase):
    def __init__(self, limit):
        self.limit = limit
        self.parts = []
        self.length = 0
        self.truncated = False

    def write(self, value):
        text = str(value)
        remaining = self.limit - self.length
        if remaining > 0:
            chunk = text[:remaining]
            self.parts.append(chunk)
            self.length += len(chunk)
        if len(text) > max(remaining, 0):
            self.truncated = True
        return len(text)

    def getvalue(self):
        text = "".join(self.parts)
        if self.truncated:
            text += "\\n... output truncated by CS Navigator ..."
        return text

stdout_buffer = CappedTextIO(MAX_OUTPUT_CHARS)

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = str(name).split(".", 1)[0]
    if root not in ALLOWED_IMPORTS:
        raise ImportError(f"Importing '{root}' is not available in the practice runner.")
    if root not in SAFE_MODULE_CACHE:
        source_module = builtins.__import__(root)
        safe_exports = {
            export_name: getattr(source_module, export_name)
            for export_name in dir(source_module)
            if not export_name.startswith("_")
            and not isinstance(getattr(source_module, export_name), types.ModuleType)
            and export_name not in {"attrgetter", "methodcaller"}
        }
        SAFE_MODULE_CACHE[root] = types.SimpleNamespace(**safe_exports)
    return SAFE_MODULE_CACHE[root]

SAFE_BUILTINS = {
    "__build_class__": builtins.__build_class__,
    "__import__": safe_import,
    "abs": abs, "all": all, "any": any, "bool": bool, "callable": callable,
    "chr": chr, "complex": complex, "dict": dict, "divmod": divmod,
    "enumerate": enumerate, "filter": filter, "float": float, "format": format,
    "frozenset": frozenset, "hash": hash, "hex": hex, "int": int, "isinstance": isinstance,
    "issubclass": issubclass, "iter": iter, "len": len, "list": list, "map": map,
    "max": max, "min": min, "next": next, "object": object, "oct": oct,
    "ord": ord, "pow": pow, "print": print, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice,
    "sorted": sorted, "str": str, "sum": sum, "super": super, "tuple": tuple,
    "zip": zip,
    "ArithmeticError": ArithmeticError, "AssertionError": AssertionError,
    "Exception": Exception, "IndexError": IndexError, "KeyError": KeyError,
    "LookupError": LookupError, "RuntimeError": RuntimeError, "StopIteration": StopIteration,
    "TypeError": TypeError, "ValueError": ValueError, "ZeroDivisionError": ZeroDivisionError,
}

def display_value(value):
    try:
        raw = json.dumps(value, default=repr)
    except Exception:
        raw = repr(value)
    if len(raw) <= MAX_VALUE_CHARS:
        return value
    return raw[:MAX_VALUE_CHARS] + "... value truncated ..."

def execute_student_module(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    tree = ast.parse(source, filename=path)
    module = types.ModuleType("student_solution")
    module.__file__ = path
    module.__name__ = "student_solution"
    module.__dict__["__builtins__"] = SAFE_BUILTINS
    sys.modules[module.__name__] = module

    final_expr = tree.body[-1] if tree.body and isinstance(tree.body[-1], ast.Expr) else None
    if final_expr and isinstance(final_expr.value, ast.Constant) and isinstance(final_expr.value.value, str):
        final_expr = None

    setup_body = tree.body[:-1] if final_expr else tree.body
    setup_tree = ast.Module(body=setup_body, type_ignores=tree.type_ignores)
    ast.fix_missing_locations(setup_tree)
    exec(compile(setup_tree, path, "exec"), module.__dict__)

    if final_expr:
        expr_tree = ast.Expression(final_expr.value)
        ast.fix_missing_locations(expr_tree)
        result = eval(compile(expr_tree, path, "eval"), module.__dict__)
        if result is not None:
            stdout_buffer.write(repr(result))
            stdout_buffer.write("\\n")

    return module

try:
    with contextlib.redirect_stdout(stdout_buffer):
        module = execute_student_module("solution.py")
    warning = ""
    if hasattr(module, function_name):
        target = getattr(module, function_name)
    elif hasattr(module, "solve"):
        target = getattr(module, "solve")
        warning = f"Expected function '{function_name}' was not found, so the runner used 'solve' instead. Rename your function to '{function_name}' for this problem."
    else:
        student_functions = [
            value for name, value in vars(module).items()
            if callable(value) and getattr(value, "__module__", "") == module.__name__ and not name.startswith("_")
        ]
        if len(student_functions) == 1:
            target = student_functions[0]
            warning = f"Expected function '{function_name}' was not found, so the runner used your only defined function. Rename it to '{function_name}' for this problem."
        else:
            available = ", ".join(
                name for name, value in vars(module).items()
                if callable(value) and getattr(value, "__module__", "") == module.__name__ and not name.startswith("_")
            ) or "none"
            raise AttributeError(f"module 'student_solution' has no function named '{function_name}'. Available student functions: {available}")
except Exception as exc:
    print(json.dumps({
        "status": "error",
        "error": f"Could not load {function_name}: {exc}",
        "tests": [],
        "stdout": stdout_buffer.getvalue(),
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }))
    raise SystemExit(0)

def _oi_canon(value):
    # Recursively sort lists so order-insensitive tests (e.g. Group Anagrams)
    # compare by content, not order.
    if isinstance(value, list):
        return sorted((_oi_canon(v) for v in value), key=lambda x: json.dumps(x, sort_keys=True, default=str))
    if isinstance(value, dict):
        return {k: _oi_canon(v) for k, v in value.items()}
    return value

for index, test in enumerate(tests, start=1):
    name = test.get("name") or f"Test {index}"
    args = test.get("args", [])
    expected = test.get("expected")
    order_insensitive = bool(test.get("order_insensitive"))
    try:
        with contextlib.redirect_stdout(stdout_buffer):
            actual = target(*args)
        if order_insensitive:
            passed = _oi_canon(actual) == _oi_canon(expected)
        else:
            passed = actual == expected
        results.append({
            "name": name,
            "passed": passed,
            "args": args,
            "expected": expected,
            "actual": display_value(actual),
        })
    except Exception as exc:
        results.append({
            "name": name,
            "passed": False,
            "args": args,
            "expected": expected,
            "actual": None,
            "error": str(exc),
        })

passed_count = sum(1 for item in results if item.get("passed"))
print(json.dumps({
    "status": "passed" if passed_count == len(results) else "failed",
    "tests": results,
    "stdout": stdout_buffer.getvalue(),
    "warning": warning,
    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
}))
"""
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_practice_") as temp_dir:
            solution_path = os.path.join(temp_dir, "solution.py")
            runner_path = os.path.join(temp_dir, "runner.py")
            with open(solution_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            with open(runner_path, "w", encoding="utf-8") as handle:
                handle.write(runner_source)

            completed = _run_isolated_process(
                [sys.executable, "-I", "-S", runner_path],
                cwd=temp_dir,
                input_text=json.dumps({"function_name": function_name, "tests": tests}),
                env={"PYTHONIOENCODING": "utf-8"},
            )
    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": f"The run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": f"Runner setup failed: {exc}",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    stdout_text = completed.stdout.strip()
    stderr_text = _truncate_text(completed.stderr.strip())
    if completed.returncode != 0 and not stdout_text:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": stderr_text or "Python returned an error before tests could run.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    try:
        payload = json.loads(stdout_text.splitlines()[-1])
    except Exception:
        return {
            "status": "error",
            "tests": [],
            "stdout": _truncate_text(stdout_text),
            "stderr": stderr_text or "Runner output could not be parsed.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    result_tests = payload.get("tests", [])
    passed = sum(1 for item in result_tests if item.get("passed"))
    total = len(result_tests)
    return {
        "status": payload.get("status", "error"),
        "passed": passed,
        "total": total,
        "tests": result_tests,
        "stdout": _truncate_text(payload.get("stdout", "")),
        "stderr": _truncate_text(payload.get("error") or payload.get("warning") or stderr_text),
        "duration_ms": payload.get("duration_ms", round((time.perf_counter() - started) * 1000, 2)),
    }


def run_javascript_practice_tests(code: str, function_name: str, tests: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        validate_javascript_code(code)
    except RunnerSecurityError as exc:
        return _security_error_response(exc)

    runner_source = r"""
const fs = require("fs");
const vm = require("vm");
const { performance } = require("perf_hooks");

const payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const tests = payload.tests || [];
const functionName = payload.function_name;
const started = performance.now();
const logs = [];
const MAX_OUTPUT_CHARS = 12000;
const MAX_VALUE_CHARS = 4000;
let logLength = 0;
let logsTruncated = false;

function appendLog(value) {
  const text = String(value);
  const remaining = MAX_OUTPUT_CHARS - logLength;
  if (remaining > 0) {
    logs.push(text.slice(0, remaining));
    logLength += Math.min(text.length, remaining);
  }
  if (text.length > Math.max(remaining, 0)) logsTruncated = true;
}

function displayValue(value) {
  let raw;
  try {
    raw = JSON.stringify(value);
  } catch {
    raw = String(value);
  }
  if (typeof raw === "undefined") raw = "undefined";
  return raw.length <= MAX_VALUE_CHARS ? value : `${raw.slice(0, MAX_VALUE_CHARS)}... value truncated ...`;
}

function canonicalValue(value, orderInsensitive = false) {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalValue(item, orderInsensitive));
    if (orderInsensitive) {
      return items.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    }
    return items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key], orderInsensitive)])
    );
  }
  return value;
}

function valuesEqual(actual, expected, orderInsensitive = false) {
  return JSON.stringify(canonicalValue(actual, orderInsensitive)) ===
    JSON.stringify(canonicalValue(expected, orderInsensitive));
}

const sandbox = {
  console: {
    log: (...args) => appendLog(args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ")),
    error: (...args) => appendLog(args.map(String).join(" ")),
  },
};

function cleanStudentCode(source) {
  return String(source)
    .replace(/^\s*export\s+\{\s*[\w\s,]+\s*\};?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

function captureFinalExpression(source) {
  const lines = String(source).replace(/\s+$/g, "").split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    if (/^(function|class|const|let|var|if|for|while|switch|return|throw|try|catch|finally)\b/.test(line)) {
      return { source: lines.join("\n"), capturesExpression: false };
    }
    if (/^[}\])]/.test(line)) {
      return { source: lines.join("\n"), capturesExpression: false };
    }
    const expression = line.replace(/;$/, "");
    lines[index] = `${rawLine.slice(0, rawLine.length - rawLine.trimStart().length)}__csnavLastValue = (${expression});`;
    return { source: lines.join("\n"), capturesExpression: true };
  }
  return { source: lines.join("\n"), capturesExpression: false };
}

function safeIdentifier(name) {
  return /^[A-Za-z_$][\w$]*$/.test(String(name || ""));
}

function getNamedFunction(name) {
  if (!safeIdentifier(name)) return undefined;
  if (typeof sandbox[name] === "function") return sandbox[name];
  try {
    const value = vm.runInContext(`typeof ${name} !== "undefined" ? ${name} : undefined`, sandbox, { timeout: 100 });
    return typeof value === "function" ? value : undefined;
  } catch {
    return undefined;
  }
}

function findDeclaredFunctionNames(source) {
  const names = new Set();
  const text = String(source || "");
  for (const match of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    names.add(match[1]);
  }
  for (const match of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g)) {
    names.add(match[1]);
  }
  return Array.from(names);
}

try {
  vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  sandbox.__csnavLastValue = undefined;
  const studentSource = cleanStudentCode(fs.readFileSync("solution.js", "utf8"));
  const prepared = captureFinalExpression(studentSource);
  vm.runInContext(prepared.source, sandbox, { timeout: 1000 });
  if (prepared.capturesExpression && typeof sandbox.__csnavLastValue !== "undefined") {
    appendLog(typeof sandbox.__csnavLastValue === "string" ? sandbox.__csnavLastValue : JSON.stringify(sandbox.__csnavLastValue));
  }

  let target = getNamedFunction(functionName);
  let warning = "";
  if (typeof target !== "function" && typeof getNamedFunction("solve") === "function") {
    target = getNamedFunction("solve");
    warning = `Expected function '${functionName}' was not found, so the runner used 'solve' instead. Rename your function to '${functionName}' for this problem.`;
  }
  if (typeof target !== "function") {
    const available = findDeclaredFunctionNames(studentSource);
    if (available.length === 1) {
      target = getNamedFunction(available[0]);
      warning = `Expected function '${functionName}' was not found, so the runner used your only defined function. Rename it to '${functionName}' for this problem.`;
    } else {
      throw new Error(`Could not find function '${functionName}'. Available student functions: ${available.join(", ") || "none"}`);
    }
  }

  const results = tests.map((test, index) => {
    const name = test.name || `Test ${index + 1}`;
    const args = test.args || [];
    const expected = test.expected;
    const orderInsensitive = Boolean(test.order_insensitive);
    try {
      const actual = target(...args);
      const passed = valuesEqual(actual, expected, orderInsensitive);
      return { name, passed, args, expected, actual: displayValue(actual) };
    } catch (error) {
      return { name, passed: false, args, expected, actual: null, error: String(error.message || error) };
    }
  });

  const passedCount = results.filter((item) => item.passed).length;
  process.stdout.write(JSON.stringify({
    status: passedCount === results.length ? "passed" : "failed",
    tests: results,
    stdout: logs.join("\n") + (logsTruncated ? "\n... output truncated by CS Navigator ..." : ""),
    warning,
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    status: "error",
    error: String(error.message || error),
    tests: [],
    stdout: logs.join("\n") + (logsTruncated ? "\n... output truncated by CS Navigator ..." : ""),
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  }));
}
"""
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_practice_js_") as temp_dir:
            solution_path = os.path.join(temp_dir, "solution.js")
            runner_path = os.path.join(temp_dir, "runner.js")
            with open(solution_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            with open(runner_path, "w", encoding="utf-8") as handle:
                handle.write(runner_source)

            node_env = {
                key: value
                for key, value in os.environ.items()
                if key.upper() in {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}
            }
            node_env["NODE_DISABLE_COLORS"] = "1"
            completed = _run_isolated_process(
                [
                    "node",
                    "--max-old-space-size=128",
                    "--disable-proto=delete",
                    "--disallow-code-generation-from-strings",
                    runner_path,
                ],
                cwd=temp_dir,
                input_text=json.dumps({"function_name": function_name, "tests": tests}),
                env=node_env,
            )
    except FileNotFoundError:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": "Node.js was not found, so JavaScript tests cannot run locally yet.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": f"The JavaScript run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": f"JavaScript runner setup failed: {exc}",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    stdout_text = completed.stdout.strip()
    stderr_text = _truncate_text(completed.stderr.strip())
    if completed.returncode != 0 and not stdout_text:
        return {
            "status": "error",
            "tests": [],
            "stdout": "",
            "stderr": stderr_text or "Node returned an error before tests could run.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    try:
        payload = json.loads(stdout_text.splitlines()[-1])
    except Exception:
        return {
            "status": "error",
            "tests": [],
            "stdout": _truncate_text(stdout_text),
            "stderr": stderr_text or "JavaScript runner output could not be parsed.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    result_tests = payload.get("tests", [])
    passed = sum(1 for item in result_tests if item.get("passed"))
    total = len(result_tests)
    return {
        "status": payload.get("status", "error"),
        "passed": passed,
        "total": total,
        "tests": result_tests,
        "stdout": _truncate_text(payload.get("stdout", "")),
        "stderr": _truncate_text(payload.get("error") or payload.get("warning") or stderr_text),
        "duration_ms": payload.get("duration_ms", round((time.perf_counter() - started) * 1000, 2)),
    }


# =============================================================================
# JAVA / C++ PRACTICE RUNNERS (compiled languages)
# =============================================================================
# These compile the student's code with a generated test harness, then run it.
# The harness compares the student's function output to each expected value and
# prints ONE JSON line per test plus a final summary line, matching the same
# result contract as the Python/JS runners (status / passed / total / tests).

def _java_literal(value: Any) -> str:
    """Render a Python value as a Java expression (Object-typed)."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return f"{value}L"  # long, widest integer the harness compares loosely
    if isinstance(value, float):
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value)  # valid Java string literal (same escaping as JSON)
    if isinstance(value, (list, tuple)):
        inner = ", ".join(_java_literal(item) for item in value)
        return f"new Object[]{{{inner}}}"
    # Fallback: stringify
    return json.dumps(str(value))


def _cpp_literal(value: Any) -> str:
    """Render a Python value as a C++ Value() expression (see Value variant below)."""
    if value is None:
        return "Value()"
    if isinstance(value, bool):
        return f"Value({'true' if value else 'false'})"
    if isinstance(value, int):
        return f"Value((long long){value})"
    if isinstance(value, float):
        return f"Value((double){value!r})"
    if isinstance(value, str):
        return f"Value(std::string({json.dumps(value)}))"
    if isinstance(value, (list, tuple)):
        inner = ", ".join(_cpp_literal(item) for item in value)
        return f"Value(std::vector<Value>{{{inner}}})"
    return f"Value(std::string({json.dumps(str(value))}))"


def _finalize_compiled_result(
    payload_lines: list[str],
    *,
    started: float,
    stderr_text: str,
) -> dict[str, Any]:
    """Parse the per-test JSON lines + summary line from a compiled harness."""
    tests: list[dict[str, Any]] = []
    status = "error"
    for line in payload_lines:
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except Exception:
            continue
        if obj.get("__summary__"):
            status = obj.get("status", "error")
            continue
        tests.append(obj)
    passed = sum(1 for item in tests if item.get("passed"))
    total = len(tests)
    if total and status == "error":
        status = "passed" if passed == total else "failed"
    return {
        "status": status,
        "passed": passed,
        "total": total,
        "tests": tests,
        "stdout": "",
        "stderr": _truncate_text(stderr_text),
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def run_java_practice_tests(code: str, function_name: str, tests: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        validate_java_code(code)
    except RunnerSecurityError as exc:
        return _security_error_response(exc)

    javac = _find_executable("javac")
    java = _find_executable("java")
    if not javac or not java:
        return empty_practice_run_response(
            "Java is not installed on this machine, so Java tests cannot run locally yet. "
            "Install a JDK (javac + java on PATH), or use Python/JavaScript for now."
        )

    # Build the test invocations as inlined Java literals.
    invocations = []
    for index, test in enumerate(tests, start=1):
        name = test.get("name") or f"Test {index}"
        args = test.get("args", []) or []
        expected = test.get("expected")
        arg_list = ", ".join(_java_literal(a) for a in args)
        invocations.append(
            f'        runTest({json.dumps(name)}, new Object[]{{{arg_list}}}, '
            f'{_java_literal(expected)});'
        )
    invocations_src = "\n".join(invocations)

    harness = f"""
import java.util.*;

public class Runner {{
    static int passed = 0, total = 0;

    static String esc(String s) {{
        StringBuilder b = new StringBuilder();
        for (char c : s.toCharArray()) {{
            if (c == '"' || c == '\\\\') b.append('\\\\').append(c);
            else if (c == '\\n') b.append("\\\\n");
            else b.append(c);
        }}
        return b.toString();
    }}
    static String show(Object o) {{
        if (o == null) return "null";
        if (o instanceof Object[]) return Arrays.deepToString((Object[]) o);
        return o.toString();
    }}
    static boolean eq(Object a, Object b) {{
        if (a == null || b == null) return a == b;
        if (a instanceof Object[] && b instanceof Object[])
            return Arrays.deepEquals((Object[]) a, (Object[]) b);
        if (a instanceof Number && b instanceof Number)
            return ((Number) a).doubleValue() == ((Number) b).doubleValue();
        return a.toString().equals(b.toString());
    }}

    static void runTest(String name, Object[] args, Object expected) {{
        total++;
        try {{
            Object actual = Solution.{function_name}(args);
            boolean ok = eq(actual, expected);
            if (ok) passed++;
            System.out.println("{{\\"name\\":\\"" + esc(name) + "\\",\\"passed\\":" + ok
                + ",\\"expected\\":\\"" + esc(show(expected)) + "\\",\\"actual\\":\\"" + esc(show(actual)) + "\\"}}");
        }} catch (Throwable t) {{
            System.out.println("{{\\"name\\":\\"" + esc(name) + "\\",\\"passed\\":false,\\"expected\\":\\""
                + esc(show(expected)) + "\\",\\"actual\\":null,\\"error\\":\\"" + esc(String.valueOf(t)) + "\\"}}");
        }}
    }}

    public static void main(String[] argv) {{
{invocations_src}
        String status = (passed == total) ? "passed" : "failed";
        System.out.println("{{\\"__summary__\\":true,\\"status\\":\\"" + status + "\\"}}");
    }}
}}
""".lstrip()

    # The student writes their function inside a Solution class. To keep the
    # harness simple, the function receives an Object[] of args (the harness
    # passes them packed). Students writing `static Object {function_name}(Object[] a)`.
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_java_") as temp_dir:
            with open(os.path.join(temp_dir, "Solution.java"), "w", encoding="utf-8") as h:
                h.write(code)
            with open(os.path.join(temp_dir, "Runner.java"), "w", encoding="utf-8") as h:
                h.write(harness)

            # javac IS a JVM, so it also needs the relaxed (no RLIMIT_AS) profile.
            compiled = _compile_source(
                [javac, "-J-Xmx256m", "-d", temp_dir, "Solution.java", "Runner.java"],
                cwd=temp_dir,
                env={"PATH": os.environ.get("PATH", "")},
                limiter=_limit_jvm_resources,
            )
            if compiled.returncode != 0:
                return {
                    "status": "error",
                    "passed": 0,
                    "total": 0,
                    "tests": [],
                    "stdout": "",
                    "stderr": _truncate_text(compiled.stderr.strip() or "Java compilation failed."),
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                }

            run = _run_isolated_process(
                [java, "-cp", temp_dir, "-Xss8m", "-Xmx128m", "Runner"],
                cwd=temp_dir,
                input_text="",
                env={"PATH": os.environ.get("PATH", "")},
                limiter=_limit_jvm_resources,
            )
    except subprocess.TimeoutExpired:
        return {
            "status": "error", "passed": 0, "total": 0, "tests": [],
            "stdout": "",
            "stderr": f"The Java run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return empty_practice_run_response(f"Java runner setup failed: {exc}")

    return _finalize_compiled_result(
        run.stdout.splitlines(),
        started=started,
        stderr_text=run.stderr.strip(),
    )


def run_cpp_practice_tests(code: str, function_name: str, tests: list[dict[str, Any]]) -> dict[str, Any]:
    try:
        validate_cpp_code(code)
    except RunnerSecurityError as exc:
        return _security_error_response(exc)

    compiler = _find_executable("g++", "clang++")
    if not compiler:
        return empty_practice_run_response(
            "A C++ compiler (g++ or clang++) is not installed on this machine, so C++ tests "
            "cannot run locally yet. Install one, or use Python/JavaScript for now."
        )

    invocations = []
    for index, test in enumerate(tests, start=1):
        name = test.get("name") or f"Test {index}"
        args = test.get("args", []) or []
        expected = test.get("expected")
        arg_list = ", ".join(_cpp_literal(a) for a in args)
        invocations.append(
            f'    runTest({json.dumps(name)}, {{{arg_list}}}, {_cpp_literal(expected)});'
        )
    invocations_src = "\n".join(invocations)

    # A tiny tagged-union Value type so student code can accept a vector<Value>.
    harness = f"""
#include <bits/stdc++.h>
using namespace std;

struct Value {{
    enum Kind {{ NUL, BOOL, INT, DBL, STR, ARR }} kind = NUL;
    bool b=false; long long i=0; double d=0; string s; vector<Value> a;
    Value() {{}}
    Value(bool x): kind(BOOL), b(x) {{}}
    Value(long long x): kind(INT), i(x) {{}}
    Value(double x): kind(DBL), d(x) {{}}
    Value(const string& x): kind(STR), s(x) {{}}
    Value(const vector<Value>& x): kind(ARR), a(x) {{}}
    string show() const {{
        switch (kind) {{
            case NUL: return "null";
            case BOOL: return b ? "true" : "false";
            case INT: return to_string(i);
            case DBL: {{ ostringstream o; o<<d; return o.str(); }}
            case STR: return s;
            case ARR: {{ string r="["; for(size_t k=0;k<a.size();k++){{ if(k) r+=", "; r+=a[k].show(); }} return r+"]"; }}
        }}
        return "";
    }}
    bool eq(const Value& o) const {{
        if ((kind==INT||kind==DBL) && (o.kind==INT||o.kind==DBL)) {{
            double x = kind==INT? (double)i : d, y = o.kind==INT? (double)o.i : o.d; return x==y;
        }}
        if (kind != o.kind) return show()==o.show();
        switch (kind) {{
            case NUL: return true;
            case BOOL: return b==o.b;
            case STR: return s==o.s;
            case ARR: {{ if(a.size()!=o.a.size()) return false; for(size_t k=0;k<a.size();k++) if(!a[k].eq(o.a[k])) return false; return true; }}
            default: return show()==o.show();
        }}
    }}
}};

// Student provides: Value {function_name}(vector<Value> args)
Value {function_name}(vector<Value> args);

{code}

static int passed_=0, total_=0;
static string esc(const string& s){{ string r; for(char c:s){{ if(c=='"'||c=='\\\\') r+='\\\\'; if(c=='\\n'){{ r+="\\\\n"; continue; }} r+=c; }} return r; }}

static void runTest(const string& name, vector<Value> args, Value expected){{
    total_++;
    try {{
        Value actual = {function_name}(args);
        bool ok = actual.eq(expected);
        if (ok) passed_++;
        cout << "{{\\"name\\":\\"" << esc(name) << "\\",\\"passed\\":" << (ok?"true":"false")
             << ",\\"expected\\":\\"" << esc(expected.show()) << "\\",\\"actual\\":\\"" << esc(actual.show()) << "\\"}}" << "\\n";
    }} catch (const exception& e) {{
        cout << "{{\\"name\\":\\"" << esc(name) << "\\",\\"passed\\":false,\\"expected\\":\\""
             << esc(expected.show()) << "\\",\\"actual\\":null,\\"error\\":\\"" << esc(e.what()) << "\\"}}" << "\\n";
    }}
}}

int main(){{
{invocations_src}
    cout << "{{\\"__summary__\\":true,\\"status\\":\\"" << (passed_==total_?"passed":"failed") << "\\"}}" << "\\n";
    return 0;
}}
""".lstrip()

    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_cpp_") as temp_dir:
            src_path = os.path.join(temp_dir, "main.cpp")
            bin_path = os.path.join(temp_dir, "a.out")
            with open(src_path, "w", encoding="utf-8") as h:
                h.write(harness)

            compiled = _compile_source(
                [compiler, "-std=c++17", "-O1", "-w", "-o", bin_path, src_path],
                cwd=temp_dir,
            )
            if compiled.returncode != 0:
                return {
                    "status": "error", "passed": 0, "total": 0, "tests": [],
                    "stdout": "",
                    "stderr": _truncate_text(compiled.stderr.strip() or "C++ compilation failed."),
                    "duration_ms": round((time.perf_counter() - started) * 1000, 2),
                }

            run = _run_isolated_process(
                [bin_path],
                cwd=temp_dir,
                input_text="",
                env={"PATH": os.environ.get("PATH", "")},
            )
    except subprocess.TimeoutExpired:
        return {
            "status": "error", "passed": 0, "total": 0, "tests": [],
            "stdout": "",
            "stderr": f"The C++ run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }
    except Exception as exc:
        return empty_practice_run_response(f"C++ runner setup failed: {exc}")

    return _finalize_compiled_result(
        run.stdout.splitlines(),
        started=started,
        stderr_text=run.stderr.strip(),
    )


def run_java_freeform(code: str) -> dict[str, Any]:
    """Compile and run a complete Java program (with a main method); capture stdout.
    The student's code must declare a public class `Main` with a `main` method.
    """
    try:
        validate_java_code(code)
    except RunnerSecurityError as exc:
        response = _security_error_response(exc)
        response["free_run"] = True
        return response

    javac = _find_executable("javac")
    java = _find_executable("java")
    if not javac or not java:
        return _empty_free_run_response(
            "Java is not installed on this machine, so Java code cannot run locally yet. "
            "Install a JDK, or use Python/JavaScript."
        )

    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_javafree_") as temp_dir:
            with open(os.path.join(temp_dir, "Main.java"), "w", encoding="utf-8") as h:
                h.write(code)
            compiled = _compile_source(
                [javac, "-J-Xmx256m", "-d", temp_dir, "Main.java"],
                cwd=temp_dir,
                env={"PATH": os.environ.get("PATH", "")},
                limiter=_limit_jvm_resources,
            )
            if compiled.returncode != 0:
                return _empty_free_run_response(
                    _truncate_text(compiled.stderr.strip() or "Java compilation failed.")
                )
            run = _run_isolated_process(
                [java, "-cp", temp_dir, "-Xss8m", "-Xmx128m", "Main"],
                cwd=temp_dir,
                input_text="",
                env={"PATH": os.environ.get("PATH", "")},
                limiter=_limit_jvm_resources,
            )
    except subprocess.TimeoutExpired:
        return _empty_free_run_response(
            f"The Java run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic."
        )
    except Exception as exc:
        return _empty_free_run_response(f"Java runner setup failed: {exc}")

    stdout_text = _truncate_text(run.stdout)
    stderr_text = _truncate_text(run.stderr.strip())
    status = "ran" if run.returncode == 0 else "error"
    return {
        "status": status,
        "free_run": True,
        "tests": [],
        "stdout": stdout_text,
        "stderr": stderr_text if status == "error" else "",
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def run_cpp_freeform(code: str) -> dict[str, Any]:
    """Compile and run a complete C++ program (with a main function); capture stdout."""
    try:
        validate_cpp_code(code)
    except RunnerSecurityError as exc:
        response = _security_error_response(exc)
        response["free_run"] = True
        return response

    compiler = _find_executable("g++", "clang++")
    if not compiler:
        return _empty_free_run_response(
            "A C++ compiler (g++ or clang++) is not installed on this machine, so C++ code "
            "cannot run locally yet. Install one, or use Python/JavaScript."
        )

    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_cppfree_") as temp_dir:
            src_path = os.path.join(temp_dir, "main.cpp")
            bin_path = os.path.join(temp_dir, "a.out")
            with open(src_path, "w", encoding="utf-8") as h:
                h.write(code)
            compiled = _compile_source(
                [compiler, "-std=c++17", "-O1", "-w", "-o", bin_path, src_path],
                cwd=temp_dir,
            )
            if compiled.returncode != 0:
                return _empty_free_run_response(
                    _truncate_text(compiled.stderr.strip() or "C++ compilation failed.")
                )
            run = _run_isolated_process(
                [bin_path],
                cwd=temp_dir,
                input_text="",
                env={"PATH": os.environ.get("PATH", "")},
            )
    except subprocess.TimeoutExpired:
        return _empty_free_run_response(
            f"The C++ run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic."
        )
    except Exception as exc:
        return _empty_free_run_response(f"C++ runner setup failed: {exc}")

    stdout_text = _truncate_text(run.stdout)
    stderr_text = _truncate_text(run.stderr.strip())
    status = "ran" if run.returncode == 0 else "error"
    return {
        "status": status,
        "free_run": True,
        "tests": [],
        "stdout": stdout_text,
        "stderr": stderr_text if status == "error" else "",
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def _empty_free_run_response(message: str, status_value: str = "error") -> dict[str, Any]:
    """Free-run response with no test cases, used for personal workspace code."""
    return {
        "status": status_value,
        "free_run": True,
        "tests": [],
        "stdout": "",
        "stderr": message,
        "duration_ms": 0,
    }


def _parse_free_run_output(
    completed: subprocess.CompletedProcess[str],
    started: float,
    fallback_error: str,
) -> dict[str, Any]:
    """Shared parser for free-run subprocess output (Python and JavaScript)."""
    stdout_text = completed.stdout.strip()
    stderr_text = _truncate_text(completed.stderr.strip())
    if completed.returncode != 0 and not stdout_text:
        return _empty_free_run_response(stderr_text or fallback_error)

    try:
        payload = json.loads(stdout_text.splitlines()[-1])
    except Exception:
        return {
            "status": "error",
            "free_run": True,
            "tests": [],
            "stdout": _truncate_text(stdout_text),
            "stderr": stderr_text or "Runner output could not be parsed.",
            "duration_ms": round((time.perf_counter() - started) * 1000, 2),
        }

    return {
        "status": payload.get("status", "error"),
        "free_run": True,
        "tests": [],
        "stdout": _truncate_text(payload.get("stdout", "")),
        "stderr": _truncate_text(payload.get("error") or stderr_text),
        "duration_ms": payload.get("duration_ms", round((time.perf_counter() - started) * 1000, 2)),
    }


def run_python_freeform(code: str) -> dict[str, Any]:
    """Execute student Python without tests or grading and capture stdout."""
    try:
        validate_python_code(code)
    except RunnerSecurityError as exc:
        response = _security_error_response(exc)
        response["free_run"] = True
        return response

    runner_source = """
import ast
import builtins
import contextlib
import io
import json
import sys
import time
import types

started = time.perf_counter()
MAX_OUTPUT_CHARS = 12000
ALLOWED_IMPORTS = {
    "bisect", "collections", "functools", "heapq", "itertools", "math",
    "operator", "re", "statistics", "string", "typing",
}
SAFE_MODULE_CACHE = {}

class CappedTextIO(io.TextIOBase):
    def __init__(self, limit):
        self.limit = limit
        self.parts = []
        self.length = 0
        self.truncated = False

    def write(self, value):
        text = str(value)
        remaining = self.limit - self.length
        if remaining > 0:
            chunk = text[:remaining]
            self.parts.append(chunk)
            self.length += len(chunk)
        if len(text) > max(remaining, 0):
            self.truncated = True
        return len(text)

    def getvalue(self):
        text = "".join(self.parts)
        if self.truncated:
            text += "\\n... output truncated by CS Navigator ..."
        return text

stdout_buffer = CappedTextIO(MAX_OUTPUT_CHARS)

def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = str(name).split(".", 1)[0]
    if root not in ALLOWED_IMPORTS:
        raise ImportError(f"Importing '{root}' is not available in the practice runner.")
    if root not in SAFE_MODULE_CACHE:
        source_module = builtins.__import__(root)
        safe_exports = {
            export_name: getattr(source_module, export_name)
            for export_name in dir(source_module)
            if not export_name.startswith("_")
            and not isinstance(getattr(source_module, export_name), types.ModuleType)
            and export_name not in {"attrgetter", "methodcaller"}
        }
        SAFE_MODULE_CACHE[root] = types.SimpleNamespace(**safe_exports)
    return SAFE_MODULE_CACHE[root]

SAFE_BUILTINS = {
    "__build_class__": builtins.__build_class__,
    "__import__": safe_import,
    "abs": abs, "all": all, "any": any, "bool": bool, "callable": callable,
    "chr": chr, "complex": complex, "dict": dict, "divmod": divmod,
    "enumerate": enumerate, "filter": filter, "float": float, "format": format,
    "frozenset": frozenset, "hash": hash, "hex": hex, "int": int, "isinstance": isinstance,
    "issubclass": issubclass, "iter": iter, "len": len, "list": list, "map": map,
    "max": max, "min": min, "next": next, "object": object, "oct": oct,
    "ord": ord, "pow": pow, "print": print, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice,
    "sorted": sorted, "str": str, "sum": sum, "super": super, "tuple": tuple,
    "zip": zip,
    "ArithmeticError": ArithmeticError, "AssertionError": AssertionError,
    "Exception": Exception, "IndexError": IndexError, "KeyError": KeyError,
    "LookupError": LookupError, "RuntimeError": RuntimeError, "StopIteration": StopIteration,
    "TypeError": TypeError, "ValueError": ValueError, "ZeroDivisionError": ZeroDivisionError,
}

def execute_student_module(path):
    with open(path, "r", encoding="utf-8") as handle:
        source = handle.read()
    tree = ast.parse(source, filename=path)
    module = types.ModuleType("student_solution")
    module.__file__ = path
    module.__name__ = "student_solution"
    module.__dict__["__builtins__"] = SAFE_BUILTINS
    sys.modules[module.__name__] = module

    final_expr = tree.body[-1] if tree.body and isinstance(tree.body[-1], ast.Expr) else None
    if final_expr and isinstance(final_expr.value, ast.Constant) and isinstance(final_expr.value.value, str):
        final_expr = None

    setup_body = tree.body[:-1] if final_expr else tree.body
    setup_tree = ast.Module(body=setup_body, type_ignores=tree.type_ignores)
    ast.fix_missing_locations(setup_tree)
    exec(compile(setup_tree, path, "exec"), module.__dict__)

    if final_expr:
        expr_tree = ast.Expression(final_expr.value)
        ast.fix_missing_locations(expr_tree)
        result = eval(compile(expr_tree, path, "eval"), module.__dict__)
        if result is not None:
            stdout_buffer.write(repr(result))
            stdout_buffer.write("\\n")

try:
    with contextlib.redirect_stdout(stdout_buffer):
        execute_student_module("solution.py")
    print(json.dumps({
        "status": "ran",
        "stdout": stdout_buffer.getvalue(),
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }))
except Exception as exc:
    print(json.dumps({
        "status": "error",
        "error": f"{type(exc).__name__}: {exc}",
        "stdout": stdout_buffer.getvalue(),
        "duration_ms": round((time.perf_counter() - started) * 1000, 2),
    }))
"""
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_freerun_") as temp_dir:
            solution_path = os.path.join(temp_dir, "solution.py")
            runner_path = os.path.join(temp_dir, "runner.py")
            with open(solution_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            with open(runner_path, "w", encoding="utf-8") as handle:
                handle.write(runner_source)

            completed = _run_isolated_process(
                [sys.executable, "-I", "-S", runner_path],
                cwd=temp_dir,
                input_text="",
                env={"PYTHONIOENCODING": "utf-8"},
            )
    except subprocess.TimeoutExpired:
        return _empty_free_run_response(
            f"The run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic."
        )
    except Exception as exc:
        return _empty_free_run_response(f"Runner setup failed: {exc}")

    return _parse_free_run_output(completed, started, "Python returned an error before it could run.")


def run_javascript_freeform(code: str) -> dict[str, Any]:
    """Execute student JavaScript without tests or grading and capture console output."""
    try:
        validate_javascript_code(code)
    except RunnerSecurityError as exc:
        response = _security_error_response(exc)
        response["free_run"] = True
        return response

    runner_source = r"""
const fs = require("fs");
const vm = require("vm");
const { performance } = require("perf_hooks");

const started = performance.now();
const logs = [];
const MAX_OUTPUT_CHARS = 12000;
let logLength = 0;
let logsTruncated = false;

function appendLog(value) {
  const text = String(value);
  const remaining = MAX_OUTPUT_CHARS - logLength;
  if (remaining > 0) {
    logs.push(text.slice(0, remaining));
    logLength += Math.min(text.length, remaining);
  }
  if (text.length > Math.max(remaining, 0)) logsTruncated = true;
}

const sandbox = {
  console: {
    log: (...args) => appendLog(args.map((arg) => typeof arg === "string" ? arg : JSON.stringify(arg)).join(" ")),
    error: (...args) => appendLog(args.map(String).join(" ")),
  },
};

function cleanStudentCode(source) {
  return String(source)
    .replace(/^\s*export\s+\{\s*[\w\s,]+\s*\};?\s*$/gm, "")
    .replace(/^\s*export\s+default\s+/gm, "")
    .replace(/^\s*export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

function captureFinalExpression(source) {
  const lines = String(source).replace(/\s+$/g, "").split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("//")) continue;
    if (/^(function|class|const|let|var|if|for|while|switch|return|throw|try|catch|finally)\b/.test(line)) {
      return { source: lines.join("\n"), capturesExpression: false };
    }
    if (/^[}\])]/.test(line)) {
      return { source: lines.join("\n"), capturesExpression: false };
    }
    const expression = line.replace(/;$/, "");
    lines[index] = `${rawLine.slice(0, rawLine.length - rawLine.trimStart().length)}__csnavLastValue = (${expression});`;
    return { source: lines.join("\n"), capturesExpression: true };
  }
  return { source: lines.join("\n"), capturesExpression: false };
}

try {
  vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });
  sandbox.__csnavLastValue = undefined;
  const studentSource = cleanStudentCode(fs.readFileSync("solution.js", "utf8"));
  const prepared = captureFinalExpression(studentSource);
  vm.runInContext(prepared.source, sandbox, { timeout: 2000 });
  if (prepared.capturesExpression && typeof sandbox.__csnavLastValue !== "undefined") {
    appendLog(typeof sandbox.__csnavLastValue === "string" ? sandbox.__csnavLastValue : JSON.stringify(sandbox.__csnavLastValue));
  }
  process.stdout.write(JSON.stringify({
    status: "ran",
    stdout: logs.join("\n") + (logsTruncated ? "\n... output truncated by CS Navigator ..." : ""),
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  }));
} catch (error) {
  process.stdout.write(JSON.stringify({
    status: "error",
    error: String(error.message || error),
    stdout: logs.join("\n") + (logsTruncated ? "\n... output truncated by CS Navigator ..." : ""),
    duration_ms: Math.round((performance.now() - started) * 100) / 100,
  }));
}
"""
    started = time.perf_counter()
    try:
        with tempfile.TemporaryDirectory(prefix="csnav_freerun_js_") as temp_dir:
            solution_path = os.path.join(temp_dir, "solution.js")
            runner_path = os.path.join(temp_dir, "runner.js")
            with open(solution_path, "w", encoding="utf-8") as handle:
                handle.write(code)
            with open(runner_path, "w", encoding="utf-8") as handle:
                handle.write(runner_source)

            node_env = {
                key: value
                for key, value in os.environ.items()
                if key.upper() in {"PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "TEMP", "TMP"}
            }
            node_env["NODE_DISABLE_COLORS"] = "1"
            completed = _run_isolated_process(
                [
                    "node",
                    "--max-old-space-size=128",
                    "--disable-proto=delete",
                    "--disallow-code-generation-from-strings",
                    runner_path,
                ],
                cwd=temp_dir,
                input_text="",
                env=node_env,
            )
    except FileNotFoundError:
        return _empty_free_run_response("Node.js was not found, so JavaScript code cannot run locally yet.")
    except subprocess.TimeoutExpired:
        return _empty_free_run_response(
            f"The JavaScript run timed out after {RUN_TIMEOUT_SECONDS} seconds. Check for infinite loops or very slow logic."
        )
    except Exception as exc:
        return _empty_free_run_response(f"JavaScript runner setup failed: {exc}")

    return _parse_free_run_output(completed, started, "Node returned an error before it could run.")
