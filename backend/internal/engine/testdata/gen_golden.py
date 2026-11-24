#!/usr/bin/env python3
"""Generates thresholds.json and golden.json for the engine golden tests.

Run from this directory:  python gen_golden.py

The expected values are computed here from the formulas in the Risk engine
and indicators v1.1 document (section "Scoring X, y1, y2", y3 options,
"Worst impact and risk magnitude", "Risk level", "Advice") with exact
fraction arithmetic and half-up decimal rounding. This script does not
import or call the Go engine; the Go test compares the engine to its output.
Thresholds are read from docs/specs/risk-engine/cre-indicators.json.
"""
import json
import math
import os
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "..", "..", "..", "..", "docs", "specs",
                    "risk-engine", "cre-indicators.json")

OPTION = {"A": 1, "B": 1, "C": 1, "D": 2, "E": 2, "F": 3, "G": 4, "H": 5, "I": 5}


def fr(v):
    return Fraction(str(v))


def rnd(q, dec):
    """Round a positive Fraction half up to dec decimals."""
    scale = 10 ** dec
    return Fraction(math.floor(q * scale + Fraction(1, 2)), scale)


def num(q):
    f = float(q)
    return int(f) if f == int(f) else f


def interp(v, pts):
    """pts: ascending (threshold, score) pairs, five of them."""
    if v <= pts[0][0]:
        return Fraction(1)
    for (x0, s0), (x1, _) in zip(pts, pts[1:]):
        if v <= x1:
            return s0 + (v - x0) / (x1 - x0)
    return Fraction(5)


def score_x(v, t):
    a, b, c, d, e = t
    v = fr(v)
    if a is None:  # only c, d, e: below c is 1, at c is 3
        c, d, e = fr(c), fr(d), fr(e)
        if v < c:
            return Fraction(1)
        if v <= d:
            return 3 + (v - c) / (d - c)
        if v <= e:
            return 4 + (v - d) / (e - d)
        return Fraction(5)
    if d is None:  # only a, b, c: above c is 5
        a, b, c = fr(a), fr(b), fr(c)
        if v <= a:
            return Fraction(1)
        if v <= b:
            return 1 + (v - a) / (b - a)
        if v <= c:
            return 2 + (v - b) / (c - b)
        return Fraction(5)
    pts = [fr(a), fr(b), fr(c), fr(d), fr(e)]
    if pts[0] > pts[4]:  # inverse: v >= a is 1, v < e is 5
        if v >= pts[0]:
            return Fraction(1)
        if v < pts[4]:
            return Fraction(5)
        for i in range(4):
            if v >= pts[i + 1]:
                return (i + 1) + (pts[i] - v) / (pts[i] - pts[i + 1])
    return interp(v, list(zip(pts, [1, 2, 3, 4, 5])))


def score_table(v, tb):
    return interp(fr(v), [(fr(tb[k]), i + 1) for i, k in enumerate("abcde")])


def level(rm):
    if rm < Fraction(3, 2):
        return "VL"
    if rm < Fraction(5, 2):
        return "L"
    if rm < Fraction(7, 2):
        return "M"
    if rm < Fraction(9, 2):
        return "H"
    return "VH"


def sqrt_round(n, dec):
    """round(sqrt(n), dec) half up, exact for a Fraction n."""
    scale = 10 ** dec
    target = n * scale * scale
    k = math.isqrt(math.floor(target))
    while Fraction(2 * k + 1, 2) ** 2 <= target:
        k += 1
    while k > 0 and Fraction(2 * k - 1, 2) ** 2 > target:
        k -= 1
    return Fraction(k, scale)


def advice(lv, rl, ric, rit, rie):
    if lv not in ("H", "VH"):
        return []
    mx = max(ric, rit, rie)
    if rl >= mx:
        return ["RL"]
    return [n for n, v in (("RI_C", ric), ("RI_T", rit), ("RI_E", rie)) if v == mx]


def expect(rl, ric, rit, rie):
    mx = max(ric, rit, rie)
    rm = sqrt_round(rl * mx, 3)
    lv = level(rm)
    return {"rl": num(rl), "ri_c": num(ric), "ri_t": num(rit), "ri_e": num(rie),
            "ri_max": num(mx), "rm": num(rm), "level": lv,
            "advice": advice(lv, rl, ric, rit, rie)}


def full_case(name, code, th, itc, itt, x, y1, y2, y3):
    rl = rnd(score_x(x, th), 2)
    ric = rnd(score_table(y1, itc), 2)
    rit = rnd(score_table(y2, itt), 2)
    rie = Fraction(max(OPTION[o] for o in y3))
    return {"name": name, "indicator": code, "x": x, "y1": y1, "y2": y2,
            "y3": y3, "expect": expect(rl, ric, rit, rie)}


def x_for(t, target):
    """An X value (2 decimals) whose RL is about `target` (1..5)."""
    a, b, c, d, e = t
    if a is not None and e is not None and a > e:  # inverse
        pts = [a, b, c, d, e]
        i = min(int(target), 4) - 1
        v = pts[i] + (pts[i + 1] - pts[i]) * (target - int(target))
        return round(max(v, 0), 2)
    if a is None:  # c, d, e
        if target < 2:
            return round(max(c - 1, 0), 2)
        pts, base = [c, d, e], 3
        target = max(target, 3)
    elif d is None:  # a, b, c
        if target > 3.5:
            return round(c * 1.5 + 1, 2)
        pts, base = [a, b, c], 1
    else:
        pts, base = [a, b, c, d, e], 1
    if target >= 5:
        return round(pts[-1] * 1.2 + 1, 2)
    i = max(0, min(int(target) - base, len(pts) - 2))
    return round(pts[i] + (pts[i + 1] - pts[i]) * (target - (base + i)), 2)


def main():
    seed = json.load(open(SEED, encoding="utf-8"))
    itc, itt = seed["ri_c_thresholds"], seed["ri_t_thresholds"]
    inds = seed["indicators"]
    th = {"ri_c": itc, "ri_t": itt, "indicators": {
        i["group_id"]: {k: i[k] for k in "abcde"} for i in inds}}
    with open(os.path.join(HERE, "thresholds.json"), "w", newline="\n") as f:
        json.dump(th, f, indent=2)
        f.write("\n")

    # Impacts vary so every advice branch (RL, RI_C, RI_T, RI_E, ties) shows.
    tiers = [("low", 1.3, 3, 5, ["A"]),
             ("middle", 3.2, 30, 40, ["F", "B"]),
             ("high", 4.7, 70, 66, ["G", "C"])]
    alt = [(85, 20, ["B"]), (10, 70, ["D"]), (30, 30, ["H", "D"])]
    cases = []
    for n, ind in enumerate(inds):
        t = [ind[k] for k in "abcde"]
        for j, (tier, tgt, y1, y2, y3) in enumerate(tiers):
            if (n + j) % 3 == 0:
                y1, y2, y3 = alt[(n // 3) % 3]
            cases.append(full_case(f"{ind['group_id']} {tier}", ind["group_id"],
                                   t, itc, itt, x_for(t, tgt), y1, y2, y3))
    # X exactly on each threshold present, to pin edge behaviour
    for ind in inds:
        t = [ind[k] for k in "abcde"]
        for k, name in zip(t, "abcde"):
            if k is not None and k > 0:
                cases.append(full_case(f"{ind['group_id']} X=threshold {name}",
                                       ind["group_id"], t, itc, itt, k, 20, 20, ["B"]))

    # Worked example EC-MG-2, and the input-layer conversion example.
    ec = next(i for i in inds if i["group_id"] == "EC-MG-2")
    t = [ec[k] for k in "abcde"]
    worked = [
        full_case("worked example EC-MG-2", "EC-MG-2", t, itc, itt,
                  8.68, 24.44, 48.03, ["C", "F", "H"]),
        full_case("worked example conversion y1 24.44 y2 16.44", "EC-MG-2",
                  t, itc, itt, 8.68, 24.44, 16.44, ["C", "F", "H"]),
    ]

    # Advice table, RM grid and level borders, given as scores.
    rows = [(5, 4, 2, 1), (4, 4, 1, 1), (2.45, 2.02, 3.10, 5),
            (3, 5, 5, 5), (4, 2, 5, 5), (2, 3, 1, 1)]
    scores = []
    for i, r in enumerate(rows):
        scores.append({"name": f"advice table row {i + 1}", "rl": r[0],
                       "ri_c": r[1], "ri_t": r[2], "ri_e": r[3],
                       "expect": expect(*[fr(v) for v in r])})
    for rl in range(5, 0, -1):
        for mx in range(1, 6):
            scores.append({"name": f"RM grid RL={rl} RI_max={mx}", "rl": rl,
                           "ri_c": mx, "ri_t": 1, "ri_e": 1,
                           "expect": expect(Fraction(rl), Fraction(mx),
                                            Fraction(1), Fraction(1))})
    for v in (1.5, 2.5, 3.5, 4.5):
        scores.append({"name": f"border RM={v}", "rl": v, "ri_c": v,
                       "ri_t": 1, "ri_e": 1,
                       "expect": expect(fr(v), fr(v), Fraction(1), Fraction(1))})

    with open(os.path.join(HERE, "golden.json"), "w", newline="\n") as f:
        json.dump({"cases": cases, "worked": worked, "scores": scores}, f, indent=1)
        f.write("\n")
    print(len(cases), "cases,", len(worked), "worked,", len(scores), "score-level")


main()
