#!/usr/bin/env python3
"""Fail on any medium or high ZAP alert (IO-266).

rules.tsv sets a level per rule id, but ZAP treats a rule the file does not
list as a WARN. This reads the JSON reports instead, so a new medium or high
rule fails too, unless rules.tsv has an IGNORE line (with a reason) for its id.
Writes a markdown table to the job summary when GITHUB_STEP_SUMMARY is set.
"""
import glob
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
RISK = {"0": "Info", "1": "Low", "2": "Medium", "3": "High"}


def ignored():
    ids = set()
    with open(os.path.join(HERE, "rules.tsv"), encoding="utf-8") as f:
        for line in f:
            cols = line.rstrip("\n").split("\t")
            if len(cols) >= 2 and cols[1] == "IGNORE":
                ids.add(cols[0])
    return ids


def main():
    skip = ignored()
    rows, failing = [], []
    for path in sorted(glob.glob(os.path.join(HERE, "out", "*.json"))):
        scan = os.path.basename(path)[:-5]
        with open(path, encoding="utf-8") as f:
            report = json.load(f)
        for site in report.get("site", []):
            for alert in site.get("alerts", []):
                code = str(alert.get("riskcode"))
                risk = RISK.get(code, "?")
                count = alert.get("count", len(alert.get("instances", [])))
                rows.append((code, scan, risk, alert["pluginid"], alert["name"], count))
                if code in ("2", "3") and alert["pluginid"] not in skip:
                    failing.append(f"{scan}: {risk} {alert['pluginid']} {alert['name']}")
    rows.sort(key=lambda r: (-int(r[0]) if r[0].isdigit() else 0, r[1]))
    lines = ["## OWASP ZAP passive scan", ""]
    lines.append("| Scan | Risk | Rule | Alert | Count |")
    lines.append("| --- | --- | --- | --- | --- |")
    lines += [f"| {s} | {r} | {i} | {n} | {c} |" for _, s, r, i, n, c in rows]
    if not rows:
        lines.append("| none | | | | |")
    lines.append("")
    lines.append(f"{len(failing)} medium or high alert(s)." if failing else "No medium or high alerts.")
    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")
    if failing:
        print("\nFAIL:\n" + "\n".join(failing), file=sys.stderr)
        sys.exit(1)


main()
