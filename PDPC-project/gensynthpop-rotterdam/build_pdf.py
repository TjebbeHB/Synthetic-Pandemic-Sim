"""Render the scientific-report markdown to a paper-styled PDF with rendered
LaTeX math (MathJax) via headless Chromium."""
from pathlib import Path
import markdown
from playwright.sync_api import sync_playwright

SRC = Path(__file__).resolve().parent.parent / "onegov2-synthetic-data" / "docs" / "scientific-report.md"
OUT = SRC.with_suffix(".pdf")

html_body = markdown.markdown(
    SRC.read_text(encoding="utf-8"),
    extensions=["tables", "fenced_code", "sane_lists", "pymdownx.arithmatex"],
    extension_configs={"pymdownx.arithmatex": {"generic": True}},
)

CSS = """
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }
body { font-family: "Iowan Old Style", Georgia, "Times New Roman", serif;
       font-size: 10.4pt; line-height: 1.5; color: #1a1f23; text-align: justify;
       hyphens: auto; }
h1 { font-size: 19pt; line-height: 1.2; margin: 0 0 2pt; text-align: left; }
h2 { font-size: 13.5pt; margin: 22px 0 7px; padding-bottom: 3px;
     border-bottom: 1.5px solid #2a5b52; color: #1d3f39; text-align: left; }
h3 { font-size: 11.5pt; margin: 16px 0 5px; color: #294b44; text-align: left; }
p { margin: 0 0 8px; }
strong { color: #14201d; }
hr { border: 0; border-top: 1px solid #cdd6d3; margin: 16px 0; }
table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9.4pt; }
th, td { border: 1px solid #c2ccc9; padding: 4px 7px; text-align: left; }
th { background: #eef4f2; font-weight: 700; }
tr:nth-child(even) td { background: #f7faf9; }
code { font-family: "SF Mono", Menlo, monospace; font-size: 9pt; background: #f0f3f2;
       padding: 1px 4px; border-radius: 3px; }
mjx-container { font-size: 1.0em !important; }
.abstract, blockquote { color: #3a4448; }
h1 + p strong { font-weight: 700; }
ul, ol { margin: 0 0 8px; padding-left: 20px; }
li { margin-bottom: 3px; }
"""

MATHJAX = """
<script>window.MathJax={tex:{inlineMath:[['\\\\(','\\\\)']],displayMath:[['\\\\[','\\\\]']]},
svg:{fontCache:'global'}};</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js"></script>
"""

html = f"<!doctype html><html><head><meta charset='utf-8'><style>{CSS}</style>{MATHJAX}</head><body>{html_body}</body></html>"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    page.set_content(html, wait_until="networkidle")
    page.evaluate("async () => { if (window.MathJax && MathJax.startup) await MathJax.startup.promise; }")
    page.pdf(
        path=str(OUT),
        format="A4",
        print_background=True,
        margin={"top": "20mm", "bottom": "16mm", "left": "18mm", "right": "18mm"},
        display_header_footer=True,
        header_template="<span></span>",
        footer_template=(
            "<div style='font-size:8px;color:#8a948f;width:100%;text-align:center;'>"
            "OneGov #2 — Synthetic-population pandemic simulator · "
            "page <span class='pageNumber'></span> / <span class='totalPages'></span></div>"
        ),
    )
    browser.close()

print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
