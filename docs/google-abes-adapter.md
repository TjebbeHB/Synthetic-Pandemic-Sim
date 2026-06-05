# Google ABES Backend Adapter

The external `google-research/agent-based-epidemic-sim` repository is useful, but it is not a drop-in JavaScript backend. It is a C++/Bazel simulator. The local clone lives outside this app at:

`../external/agent-based-epidemic-sim`

## What Is Wired Now

- `scripts/write_google_abes_config.py` converts `src/data/dutchProfiles.json` into a Google ABES `home_work` `config.pbtxt`.
- It maps the app scenario parameters to ABES fields where the stock model supports them:
  - population size
  - initial susceptible/infectious/recovered distribution
  - incubation and infectious durations
  - transmissibility
  - household size distribution
  - social distancing start day and essential-worker fraction
  - mortality via `INFECTIOUS -> REMOVED`
- Example:

```bash
python3 scripts/write_google_abes_config.py \
  --mode hague \
  --output artifacts/google-abes-hague.pbtxt
```

Then, once Bazel or the repo Docker build is available:

```bash
cd ../external/agent-based-epidemic-sim
bazel run //agent_based_epidemic_sim/applications/home_work:main -- \
  --simulation_config_pbtxt_path=/absolute/path/to/artifacts/google-abes-hague.pbtxt \
  --output_file_path=/absolute/path/to/artifacts/google-abes-hague-output.csv \
  --num_workers=8
```

## Important Limitations

The stock ABES `home_work` app has global transmissibility and generic home/work location distributions. Its `config.proto` explicitly leaves infectivity and susceptibility distributions as future work. That means our browser engine currently models Dutch-specific features that the stock ABES config cannot yet express directly:

- BU-level Hague geography
- age-specific susceptibility
- vaccination rollout by day
- event intensity by facility proximity
- route-level commuter links between Dutch areas
- individual compliance with regulation

For a production-grade backend, the next step is not to replace the app with ABES blindly. The right path is to extend ABES with Dutch location generation and per-agent attributes, then ingest its output CSV into the React frontend as another simulation source.
