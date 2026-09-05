# GreenPT API (optional)

[GreenPT](https://greenpt.nl/) provides API access to LLMs hosted on Dutch / EU infrastructure. The challenge brief lists it as an **optional resource** for teams that want to integrate generative steps into their pipeline.

## Where an LLM call might help

- **Documentation:** turn raw variable definitions into human-friendly summaries.
- **Data dictionary generation:** describe each generated column in plain Dutch / English.
- **Demo / explanation layer:** "explain this *buurt* profile to a non-specialist" in a pitch demo.
- **Quality-report narrative:** turn numerical fit metrics into a short paragraph.

## Where an LLM call should **not** be used

- ❌ To **invent person-level records** that are then claimed to be synthetic-statistical. The synthesis itself must be statistically grounded.
- ❌ To fill missing CBS cells with plausible-looking text; use proper imputation or document the gap.
- ❌ To bypass the open-source requirement (your LLM prompts and outputs that go into the dataset must be reproducible).

## Practical notes

- **Authentication.** Teams that want to use GreenPT during the hackathon should ask the organisers at [hack@govtechnl.nl](mailto:hack@govtechnl.nl) for credentials.
- **Reproducibility.** Pin a model version, log prompts and responses, set deterministic decoding where possible.
- **Privacy.** Do not send anything that could be a quasi-identifier of a real person through the API.

If your submission uses GreenPT, note in the PR description **where** (which stage of the pipeline) and **why**.
