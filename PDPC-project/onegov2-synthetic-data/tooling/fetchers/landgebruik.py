"""Convenience wrapper for CBS Bodemgebruik (table 70262NED)."""

from __future__ import annotations

import argparse
from pathlib import Path

from . import cbs_statline  # noqa: F401  (CLI module)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True, help="Output directory.")
    args = parser.parse_args()
    out = Path(args.out)

    print(
        "Run `python -m fetchers.cbs_statline --table 70262NED "
        f"--out {out}` to fetch CBS Bodemgebruik."
    )


if __name__ == "__main__":
    main()
