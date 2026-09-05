# Contributing

Thanks for your interest in the **OneGov #2 | Synthetic Data: Pandemic Preparedness** challenge repository.

This repo is maintained by **GovTech NL** together with the challenge owners **CBS, ODISSEI, Erasmus MC and Digicampus** for the hackathon on **4–5 June 2026** at The Hague Tech. Contributions are welcome from organisers, mentors, participating teams, and the wider community.

## Two contribution flows

### 1. Hackathon teams: fork → build → one PR

This is the primary flow during the hackathon.

1. **Fork** this repository to your team's GitHub account and clone the fork.
2. Build your synthetic-population generator and output in your fork.
3. Open **one Pull Request per team** into `main` of `govtechnl/onegov2-synthetic-data`.
4. Use the [pull request template](.github/pull_request_template.md) and tick every Must-have box.

PRs that pass the Must-have checklist are merged into the central library after the hackathon.

### 2. Improving the starter repo

Outside the hackathon flow you can also help improve the starter itself:

- **Sharpen documentation** under [`docs/`](docs/) (personas, scenarios, glossary, judging criteria, methodology notes).
- **Extend the variable catalogue** in [`data/variables.yaml`](data/variables.yaml) or the source catalogue in [`data/sources.yaml`](data/sources.yaml).
- **Improve the data fetchers** under [`tooling/fetchers/`](tooling/fetchers/) or the example scripts under [`tooling/examples/`](tooling/examples/).
- **Report issues** using the [issue templates](.github/ISSUE_TEMPLATE/).

## Ground rules

1. **Public open data only.** Every variable in your submission must trace back to a public, openly licensed source (CBS StatLine, Emissieregistratie, RIVM/NRS open GIS, BAG, …). No closed or paywalled data; no leaked micro-data.
2. **No real persons.** Synthetic records must be non-attributable to real individuals. Apply disclosure protection (k-anonymity, small-cell suppression) close to the source.
3. **Reproducibility.** Generation must be deterministic given a seed. Avoid wall-clock time, unsignalled network calls, or non-seeded randomness.
4. **Open source.** All submitted code and methodology is released under the repository licences (Apache-2.0 for code, CC BY 4.0 for data and docs).
5. **Document the provenance.** Each must-have variable in your output must point back to its CBS table or open-GIS layer. A quality report belongs with every submission.
6. **Plain language.** Documentation is primarily in English; Dutch terms are kept where they are the authoritative form (e.g. *buurtcode*, *RWZI*, *catchment*).

## Development workflow

```powershell
cd tooling
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .[dev]

# Validate the variable & source catalogues
pytest -v

# Fetch a small reference subset (CBS Open Data API)
python -m fetchers.cbs_statline --table 86165NED --region "Utrecht" --out ..\data\reference
```

CI ([`.github/workflows/validate.yml`](.github/workflows/validate.yml)) runs the catalogue checks on every push and PR. Please make sure they pass locally before opening a PR.

## Pull requests

- Keep PRs focused, one logical change per PR (the one-PR-per-team rule above is the hackathon exception, not a general rule).
- Update the README, the variable catalogue, or the docs when behaviour changes.
- Reference the related issue if there is one.

## Code of Conduct

By participating you agree to abide by the [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1), including the section on **responsible use of synthetic population data**.

## Licensing of contributions

This is the **canonical licensing rule** for the repository. All other
documents (PR template, README, CHALLENGE.md) refer back here.

- This **starter repository** is licensed under **Apache-2.0** for code
  (see [LICENSE](LICENSE)) and **CC BY 4.0** for data, documentation, and
  challenge text (see [LICENSE-DATA](LICENSE-DATA)).
- **Hackathon team submissions** must be released open source under an
  **OSI-approved licence** for code (Apache-2.0, MIT, EUPL-1.2 or another
  OSI-approved licence) and an open data licence for the dataset and the
  quality report (CC BY 4.0 recommended; CC0 also accepted).
- Code contributed *into this starter repo* is licensed under Apache-2.0;
  data and documentation contributed into this repo are licensed under
  CC BY 4.0. Submissions that live in a team fork can keep any
  OSI-approved licence as long as it is openly readable from the PR.

By submitting a contribution you confirm that you have the right to
license it under these terms.
