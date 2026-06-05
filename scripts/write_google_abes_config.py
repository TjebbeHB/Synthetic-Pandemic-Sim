"""Write a Google ABES home_work config from the Dutch synthetic profiles.

This is an adapter scaffold for the external google-research
agent-based-epidemic-sim repository. It emits a pbtxt that can be passed to:

  bazel run //agent_based_epidemic_sim/applications/home_work:main -- \
    --simulation_config_pbtxt_path=/path/to/config.pbtxt \
    --output_file_path=/path/to/output.csv

The stock home_work app has a single global transmissibility and home/work
location distributions, so city/neighbourhood heterogeneity still needs either
multiple ABES runs or a C++ extension for Dutch geography-aware locations.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
PROFILE_JSON = REPO_ROOT / "src" / "data" / "dutchProfiles.json"


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def household_size_distribution(profiles: list[dict[str, Any]]) -> dict[int, float]:
    buckets = {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0, 5: 0.0}
    total_population = sum(profile["population"] for profile in profiles) or 1
    for profile in profiles:
        weight = profile["population"] / total_population
        mix = profile["householdMix"]
        buckets[1] += weight * mix.get("single", 0.0)
        buckets[2] += weight * mix.get("couple", 0.0)
        buckets[3] += weight * mix.get("shared", 0.0)
        buckets[4] += weight * mix.get("family", 0.0)
        buckets[5] += weight * mix.get("multigen", 0.0)
    total = sum(buckets.values()) or 1
    return {size: value / total for size, value in buckets.items()}


def national_profiles(payload: dict[str, Any]) -> list[dict[str, Any]]:
    context = payload["nationalContext"]
    return [
        {
            "population": context["population"],
            "householdMix": context["householdMix"],
        }
    ]


def hague_profiles(payload: dict[str, Any]) -> list[dict[str, Any]]:
    return payload["hagueProfiles"]


def build_pbtxt(args: argparse.Namespace, payload: dict[str, Any]) -> str:
    profiles = hague_profiles(payload) if args.mode == "hague" else national_profiles(payload)
    population_size = args.population_size or round(sum(profile["population"] for profile in profiles))
    infectious_ratio = clamp(args.initial_cases / max(1, population_size), 0.0, 0.2)
    recovered_ratio = clamp(args.prior_immunity, 0.0, 0.95)
    susceptible_ratio = clamp(1 - infectious_ratio - recovered_ratio, 0.0, 1.0)
    death_probability = clamp(args.mortality_probability * args.mortality_multiplier, 0.0, 0.25)
    recovered_probability = 1 - death_probability
    policy_seconds = round(args.policy_start_day * 86400)
    worker_fraction = clamp(1 - args.mobility_reduction, 0.02, 1.0)
    household_buckets = household_size_distribution(profiles)

    household_pb = "\n".join(
        f"""    buckets {{
      int_value: {size}
      count: {count:.6f}
    }}"""
        for size, count in household_buckets.items()
    )

    return f"""# proto-file: agent_based_epidemic_sim/applications/home_work/config.proto
# proto-message: HomeWorkSimulationConfig
# Generated from onegov2-synthetic-data/scripts/write_google_abes_config.py

init_time {{
}}

population_size: {population_size}
agent_properties {{
  ptts_transition_model {{
    state_transition_diagram {{
      health_state: EXPOSED
      transition_probability {{
        health_state: INFECTIOUS
        transition_probability: 1
        mean_days_to_transition: {args.incubation_days:.3f}
        sd_days_to_transition: {max(0.4, args.incubation_days * 0.28):.3f}
      }}
    }}
    state_transition_diagram {{
      health_state: INFECTIOUS
      transition_probability {{
        health_state: RECOVERED
        transition_probability: {recovered_probability:.6f}
        mean_days_to_transition: {args.infectious_days:.3f}
        sd_days_to_transition: {max(0.5, args.infectious_days * 0.35):.3f}
      }}
      transition_probability {{
        health_state: REMOVED
        transition_probability: {death_probability:.6f}
        mean_days_to_transition: {args.infectious_days:.3f}
        sd_days_to_transition: {max(0.5, args.infectious_days * 0.35):.3f}
      }}
    }}
  }}
  departure_distribution {{
    mean: {args.departure_mean:.3f}
    stddev: {args.departure_stddev:.3f}
  }}
  work_duration_distribution {{
    mean: {args.work_duration_mean:.3f}
    stddev: {args.work_duration_stddev:.3f}
  }}
  arrival_distribution {{
    mean: {args.arrival_mean:.3f}
    stddev: {args.arrival_stddev:.3f}
  }}
  initial_health_state_distribution {{
    buckets {{
      proto_value {{ [type.googleapis.com/abesim.HealthState] {{ state: SUSCEPTIBLE }} }}
      count: {susceptible_ratio:.8f}
    }}
    buckets {{
      proto_value {{ [type.googleapis.com/abesim.HealthState] {{ state: INFECTIOUS }} }}
      count: {infectious_ratio:.8f}
    }}
    buckets {{
      proto_value {{ [type.googleapis.com/abesim.HealthState] {{ state: RECOVERED }} }}
      count: {recovered_ratio:.8f}
    }}
  }}
}}
location_distributions {{
  business_distribution {{
    alpha: {args.business_alpha:.3f}
    beta: {args.business_beta:.3f}
  }}
  household_size_distribution {{
{household_pb}
  }}
}}
transmissibility: {args.transmissibility:.6f}
distancing_policy {{
  stages {{
    start_time {{
      seconds: {policy_seconds}
    }}
    essential_worker_fraction: {worker_fraction:.6f}
  }}
}}
step_size {{
  seconds: 86400
}}
num_steps: {args.max_days}
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["nation", "hague"], default="hague")
    parser.add_argument("--output", type=Path, default=REPO_ROOT / "artifacts" / "google-abes-hague.pbtxt")
    parser.add_argument("--population-size", type=int, default=0)
    parser.add_argument("--initial-cases", type=float, default=12)
    parser.add_argument("--prior-immunity", type=float, default=0.04)
    parser.add_argument("--transmissibility", type=float, default=0.62)
    parser.add_argument("--incubation-days", type=float, default=5)
    parser.add_argument("--infectious-days", type=float, default=7)
    parser.add_argument("--max-days", type=int, default=150)
    parser.add_argument("--mortality-probability", type=float, default=0.006)
    parser.add_argument("--mortality-multiplier", type=float, default=1)
    parser.add_argument("--policy-start-day", type=int, default=24)
    parser.add_argument("--mobility-reduction", type=float, default=0.32)
    parser.add_argument("--business-alpha", type=float, default=0.5)
    parser.add_argument("--business-beta", type=float, default=1000)
    parser.add_argument("--departure-mean", type=float, default=0.3)
    parser.add_argument("--departure-stddev", type=float, default=0.3)
    parser.add_argument("--work-duration-mean", type=float, default=0.3)
    parser.add_argument("--work-duration-stddev", type=float, default=0.3)
    parser.add_argument("--arrival-mean", type=float, default=0.3)
    parser.add_argument("--arrival-stddev", type=float, default=0.3)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = json.loads(PROFILE_JSON.read_text(encoding="utf-8"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_pbtxt(args, payload), encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()
