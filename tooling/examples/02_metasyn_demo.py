"""Stub: minimal MetaSyn flow on a CBS buurt aggregate.

Replace this stub with a real flow in your fork. See
docs/integrations/metasyn.md for the design.

Run:
    python examples/02_metasyn_demo.py
"""

from __future__ import annotations


def main() -> None:
    print(
        "MetaSyn demo placeholder. Steps to implement:\n"
        "  1. Fetch a CBS table per buurt (see tooling/fetchers/cbs_statline.py).\n"
        "  2. Build a MetaSyn MetaFrame from the marginals.\n"
        "  3. Call MetaFrame.synthesize(n) per buurt.\n"
        "  4. Concatenate and attach buurt_code.\n"
        "See https://metasyn.readthedocs.io/ for the API."
    )


if __name__ == "__main__":
    main()
