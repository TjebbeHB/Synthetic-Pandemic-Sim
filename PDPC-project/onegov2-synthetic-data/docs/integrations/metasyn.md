# MetaSyn

[MetaSyn](https://github.com/sodascience/metasyn) is an open-source Python library developed by the SoDa team at Utrecht University for synthesising tabular data from *distributional metadata*. The challenge brief points to it as a **reference and inspiration**; using it is **not required**.

## Why it is relevant to this challenge

- Built for the kind of "from aggregates to individuals" upscaling this challenge asks for.
- Privacy-friendly by construction: it works from distributions and metadata, not from raw individual records.
- Plays well with CBS data that is already published as marginals and small-area aggregates.

## Where it fits in the pipeline

```
CBS StatLine tables  ─►  MetaSyn meta-file (.json)  ─►  MetaSyn synth()  ─►  synthetic table
                                                                                  │
                                                                                  ▼
                                                                          quality report + spatial join
```

Typical flow for a Layer 1 (demographics) submission:

1. Fetch the relevant CBS table per *buurt* (e.g. `86165NED`) via [`tooling/fetchers/cbs_statline.py`](../../tooling/fetchers/cbs_statline.py).
2. Convert the *buurt*-level marginals into a MetaSyn `MetaFrame` description, one per *buurt*.
3. Call `MetaFrame.synthesize(n)` to draw a synthetic micro-population for that *buurt*.
4. Concatenate per-*buurt* outputs, attach `buurt_code`.
5. Validate with your quality report.

## Caveats

- MetaSyn by default samples each column independently from its marginal; to get **cross-domain consistency** you need to define joint or conditional columns explicitly (or pair it with IPF).
- The library evolves quickly; pin the version in your `pyproject.toml` for reproducibility.
- It is not the only option  -  see [`../methoden.md`](../methoden.md) for alternatives.

## See also

- [`tooling/examples/02_metasyn_demo.py`](../../tooling/examples/02_metasyn_demo.py)  -  minimal MetaSyn flow on a single CBS buurt.
- MetaSyn docs: <https://metasyn.readthedocs.io/>

