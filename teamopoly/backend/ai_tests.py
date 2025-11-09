# backend/ai_tests.py
import re
from typing import Dict, List

def _dedent(s: str) -> str:
    # pretty code blocks
    lines = s.strip("\n").splitlines()
    if not lines: return s
    pad = min((len(l) - len(l.lstrip())) for l in lines if l.strip()) if any(l.strip() for l in lines) else 0
    return "\n".join(l[pad:] for l in lines)

def _mk(title: str, framework: str, description: str, code: str) -> Dict:
    return {
        "title": title,
        "framework": framework,          # 'pytest' | 'jest'
        "description": description,
        "code": _dedent(code)
    }

# ------------------ JavaScript / TypeScript ------------------

_EXPORT_FN  = re.compile(r"export\s+function\s+([A-Za-z0-9_]+)\s*\(")
_EXPORT_CONST= re.compile(r"export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(")
_EXPORT_DEFAULT_FN = re.compile(r"export\s+default\s+function\s+([A-Za-z0-9_]+)?\s*\(")
_EXPORT_DEFAULT_ANY= re.compile(r"export\s+default\s+([A-Za-z0-9_]+)")
_IS_REACT = re.compile(r'from\s+[\'"]react[\'"]|React\.|<\w+[^>]*>')

def _gen_js_tests(code: str, fname: str = "module") -> List[Dict]:
    tests = []

    is_react = bool(_IS_REACT.search(code)) or fname.endswith((".jsx", ".tsx"))

    # gather export names
    names = set(_EXPORT_FN.findall(code))
    names |= set(_EXPORT_CONST.findall(code))
    dfn = _EXPORT_DEFAULT_FN.search(code)
    if dfn:
        if dfn.group(1):
            names.add(dfn.group(1))
        else:
            names.add("DefaultExport")
    anydef = _EXPORT_DEFAULT_ANY.search(code)
    if anydef:
        names.add(anydef.group(1))

    # Fallback: basic “exists”
    if not names:
        tests.append(_mk(
            "jest: module loads",
            "jest",
            "Ensures the module can be imported without throwing.",
            f"""
            test('module loads', async () => {{
              await import('./{fname}');
            }});
            """,
        ))
        return tests

    # For React, add a render smoke test
    if is_react:
        comp = next(iter(names))
        tests.append(_mk(
            f"jest: {comp} renders",
            "jest",
            "Renders the React component without crashing.",
            f"""
            import React from 'react';
            import {{ render, screen }} from '@testing-library/react';
            import '@testing-library/jest-dom';
            import { {comp} } from './{fname}';

            test('{comp} renders', () => {{
              render(<{comp} />);
              // expect(screen.getByText(/./)).toBeInTheDocument(); // refine selector
            }});
            """,
        ))

    # For every exported function, make a shape test
    for n in sorted(names):
        tests.append(_mk(
            f"jest: {n} is callable",
            "jest",
            f"Checks that `{n}` is exported and callable.",
            f"""
            import * as mod from './{fname}';

            test('{n} is callable', () => {{
              expect(typeof mod.{n}).toBe('function');
            }});
            """,
        ))

    # Example param test stub for a common util name
    for util in ["sum", "add", "formatDate", "toTitleCase"]:
        if util in names:
            tests.append(_mk(
                f"jest: {util} simple case",
                "jest",
                f"Sanity check for `{util}`.",
                f"""
                import {{ {util} }} from './{fname}';

                test('{util}(2, 3) = 5', () => {{
                  expect({util}(2, 3)).toBe(5);
                }});
                """,
            ))

    return tests

# ------------------ Python ------------------

_DEF_RE   = re.compile(r"^\s*def\s+([A-Za-z0-9_]+)\s*\(", re.M)
_CLASS_RE = re.compile(r"^\s*class\s+([A-Za-z0-9_]+)\s*(\(|:)", re.M)

def _gen_py_tests(code: str, fname: str = "module") -> List[Dict]:
    tests = []
    fns = _DEF_RE.findall(code)
    klasses = _CLASS_RE.findall(code)
    klasses = [k for (k, _) in klasses]

    if not fns and not klasses:
        tests.append(_mk(
            "pytest: module imports",
            "pytest",
            "Ensures the module imports without errors.",
            f"""
            import importlib

            def test_imports():
                importlib.import_module('{fname}')
            """,
        ))
        return tests

    for fn in fns[:8]:
        tests.append(_mk(
            f"pytest: {fn} exists",
            "pytest",
            f"Checks `{fn}` is defined and callable.",
            f"""
            import types
            import {fname} as mod

            def test_{fn}_callable():
                assert hasattr(mod, '{fn}')
                assert isinstance(getattr(mod, '{fn}'), types.FunctionType)
            """,
        ))

    for cls in klasses[:5]:
        tests.append(_mk(
            f"pytest: {cls} construct",
            "pytest",
            f"Constructs `{cls}` with no args (adjust as needed).",
            f"""
            import {fname} as mod

            def test_{cls.lower()}_construct():
                obj = getattr(mod, '{cls}')()
                assert obj is not None
            """,
        ))

    return tests

# ------------------ Public API ------------------

def generate_tests(language: str, code: str, filename: str = "module.js") -> Dict:
    """
    Returns:
      {
        "suggestions": [
           {"title","framework","description","code"}, ...
        ]
      }
    """
    language = (language or "text").lower()
    if language in ("javascript", "typescript", "jsx", "tsx"):
        return {"suggestions": _gen_js_tests(code, fname=filename)}
    if language == "python":
        # strip extension for `import module`
        base = filename.rsplit("/", 1)[-1]
        base = base.rsplit(".", 1)[0]
        return {"suggestions": _gen_py_tests(code, fname=base)}
    # default
    return {"suggestions": [
        _mk("generic: file loads", "jest", "Placeholder test.", f"test('placeholder',()=>{{ expect(true).toBe(true); }});")
    ]}
