"""Goodness-of-fit: compare the synthetic population's marginals to the CBS
buurt marginals it was built from (standardized absolute error, like the paper)."""
import sys
import pandas as pd
sys.path.insert(0, ".")
from build_rotterdam_population import load_buurten, AGE_GROUPS, MIGRATION  # noqa: E402

df = pd.read_csv("output/rotterdam_synthetic_population.csv")
buurten = load_buurten()
pop = len(df)
print(f"Synthetic individuals: {pop:,}\n")


def sae(synth_counts: dict, target_counts: dict) -> float:
    keys = set(synth_counts) | set(target_counts)
    tae = sum(abs(synth_counts.get(k, 0) - target_counts.get(k, 0)) for k in keys)
    n = sum(target_counts.values()) or 1
    return tae / n


# Per-buurt fit, averaged (this is the spatially-explicit accuracy that matters).
age_sae, gender_sae, mig_sae = [], [], []
g = df.groupby("neighb_code")
for b in buurten:
    sub = g.get_group(b["neighb_code"])
    age_sae.append(sae(sub.age_group.value_counts().to_dict(), b["age"]))
    gender_sae.append(sae(sub.gender.value_counts().to_dict(), b["gender"]))
    mig_sae.append(sae(sub.migration_background.value_counts().to_dict(), b["migration"]))

print("Per-buurt standardized absolute error (lower=better; paper reports ~0.00-0.05):")
print(f"  age_group           : {sum(age_sae)/len(age_sae):.4f}")
print(f"  gender              : {sum(gender_sae)/len(gender_sae):.4f}")
print(f"  migration_background: {sum(mig_sae)/len(mig_sae):.4f}")

print("\nCity-wide distributions:")
for col in ["age_group", "gender", "migration_background", "education_level", "activity",
            "work_sector", "household_role", "income_group", "car_ownership"]:
    order = AGE_GROUPS if col == "age_group" else None
    vc = (df[col].value_counts(normalize=True) * 100).round(1)
    if order:
        vc = vc.reindex(order)
    print(f"  {col}: {vc.to_dict()}")

print("\nActivity by age group (row %):")
ct = (pd.crosstab(df.age_group, df.activity, normalize="index") * 100).round(0).reindex(AGE_GROUPS)
print(ct.to_string())
