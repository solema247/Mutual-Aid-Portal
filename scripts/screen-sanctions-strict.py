#!/usr/bin/env python3
"""Strict sanctions screen: full legal name (exact token multiset) + optional DOB pattern.

Requires: /tmp/sanctions/sdn.xml and uk-conlist.csv (OFAC + UK OFSI).
Run from repo root: python3 scripts/screen-sanctions-strict.py
"""

from __future__ import annotations

import csv
import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

SANCTIONS_DIR = "/tmp/sanctions"
OUTPUT = os.path.join(os.path.dirname(__file__), "output", "sanctions-strict-screen.json")

STOP = {"bin", "ibn", "mr", "mrs", "dr", "the", "of", "for", "name", "account", "number", "bank", "signature"}
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    with open(".env.local", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip("'\"")
    return env


def tokens(name: str) -> list[str]:
    s = re.sub(r"[^a-z\u0600-\u06ff\s]", " ", (name or "").lower())
    return [w for w in s.split() if len(w) > 1 and w not in STOP and not w.isdigit()]


def multiset_key(name: str) -> tuple[tuple[str, int], ...]:
    return tuple(sorted(Counter(tokens(name)).items()))


def full_legal_name_match(a: str, b: str) -> bool:
    return multiset_key(a) == multiset_key(b) and sum(Counter(tokens(a)).values()) >= 2


def parse_date(raw: str) -> dict | None:
    s = raw.strip()
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s)
    if m:
        d, mo, y = map(int, m.groups())
        return {"day": d or None, "month": mo or None, "year": y, "raw": s}
    m = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$", s)
    if m:
        d, mo, y = int(m[1]), int(m[2]), int(m[3])
        if y < 100:
            y += 1900 if y > 30 else 2000
        return {"day": d, "month": mo, "year": y, "raw": s}
    m = re.match(r"^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$", s)
    if m:
        y, mo, d = map(int, m.groups())
        return {"day": d, "month": mo, "year": y, "raw": s}
    m = re.match(r"^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$", s)
    if m:
        mon = MONTHS.get(m[2].lower()[:3])
        if mon:
            return {"day": int(m[1]), "month": mon, "year": int(m[3]), "raw": s}
    return None


def date_match_type(a: dict, b: dict) -> str | None:
    if a.get("day") and b.get("day") and a.get("month") and b.get("month") and a.get("year") and b.get("year"):
        if a["day"] == b["day"] and a["month"] == b["month"] and a["year"] == b["year"]:
            return "full"
    if a.get("month") and b.get("month") and a.get("year") and b.get("year"):
        if a["month"] == b["month"] and a["year"] == b["year"]:
            return "month_year"
    if a.get("day") and b.get("day") and a.get("month") and b.get("month"):
        if a["day"] == b["day"] and a["month"] == b["month"]:
            return "day_month"
    return None


def extract_dates(text: str) -> list[dict]:
    found: list[dict] = []
    for m in re.finditer(r"\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}[/.-]\d{1,2}[/.-]\d{1,2}\b", text):
        p = parse_date(m.group())
        if p:
            found.append(p)
    seen: set[tuple] = set()
    out: list[dict] = []
    for d in found:
        k = (d.get("day"), d.get("month"), d.get("year"))
        if k not in seen:
            seen.add(k)
            out.append(d)
    return out


def extract_names_banking(text: str) -> list[str]:
    if not text:
        return []
    names: set[str] = set()
    for m in re.finditer(r"(?:^|\n)\s*Name\s*:\s*([^\n]+)", text, re.I):
        if len(m.group(1).strip()) > 2:
            names.add(m.group(1).strip())
    bank_kw = re.compile(r"bank|account|number|iban|signature|date\s*:|بنك", re.I)
    for line in [l.strip() for l in text.split("\n") if l.strip()][:4]:
        if bank_kw.search(line) or re.sub(r"\s", "", line).isdigit():
            continue
        if 6 <= len(line) < 100 and len(line.split()) >= 2:
            names.add(re.sub(r"^(the works of)\s+", "", line, flags=re.I))
    return list(names)


def sb_get(env: dict[str, str], table: str, select: str) -> list[dict]:
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    url = f"{env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/{table}?select={urllib.parse.quote(select)}"
    headers = {"apikey": env["NEXT_PUBLIC_SUPABASE_ANON_KEY"], "Authorization": f"Bearer {key}"}
    all_rows: list[dict] = []
    start = 0
    while True:
        req = urllib.request.Request(url, headers={**headers, "Range": f"{start}-{start + 999}"})
        with urllib.request.urlopen(req) as r:
            chunk = json.loads(r.read())
        if not chunk:
            break
        all_rows.extend(chunk)
        if len(chunk) < 1000:
            break
        start += 1000
    return all_rows


def load_sanctions() -> list[dict]:
    ns = "{https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/XML}"
    root = ET.parse(os.path.join(SANCTIONS_DIR, "sdn.xml")).getroot()
    out: list[dict] = []
    for entry in root.findall(f".//{ns}sdnEntry"):
        st = entry.find(f"{ns}sdnType")
        if st is None or st.text != "Individual":
            continue
        fe, le = entry.find(f"{ns}firstName"), entry.find(f"{ns}lastName")
        first = (fe.text or "").strip() if fe is not None else ""
        last = (le.text or "").strip() if le is not None else ""
        display = f"{first} {last}".strip() or last
        dates: list[dict] = []
        dlist = entry.find(f"{ns}dateOfBirthList")
        if dlist is not None:
            for item in dlist.findall(f"{ns}dateOfBirthItem"):
                dob = item.find(f"{ns}dateOfBirth")
                if dob is not None and dob.text:
                    p = parse_date(dob.text.strip())
                    if p:
                        dates.append(p)
        program = None
        prog_el = entry.find(f"{ns}programList")
        if prog_el is not None:
            pe = prog_el.find(f"{ns}program")
            if pe is not None:
                program = pe.text
        out.append(
            {
                "name": display,
                "display": f"{last}, {first}".strip(", "),
                "mkey": multiset_key(display),
                "dates": dates,
                "list": "OFAC",
                "program": program,
            }
        )

    with open(os.path.join(SANCTIONS_DIR, "uk-conlist.csv"), encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f.readlines()[1:])
        for row in reader:
            parts = [(row.get(k) or "").strip() for k in ["Name 6", "Name 1", "Name 2", "Name 3"] if (row.get(k) or "").strip()]
            if len(parts) < 2:
                continue
            display = " ".join(parts)
            dates: list[dict] = []
            dob = (row.get("DOB") or "").strip()
            if dob:
                p = parse_date(dob)
                if p:
                    dates.append(p)
            out.append(
                {
                    "name": display,
                    "display": display,
                    "mkey": multiset_key(display),
                    "dates": dates,
                    "list": "UK",
                    "program": row.get("Regime"),
                }
            )
    return out


def main() -> None:
    env = load_env()
    sanctions = load_sanctions()
    by_mkey: dict[tuple, list[dict]] = defaultdict(list)
    by_set: dict[frozenset, list[dict]] = defaultdict(list)
    for s in sanctions:
        if s["mkey"]:
            by_mkey[s["mkey"]].append(s)
            by_set[frozenset(t for t, _ in s["mkey"])].append(s)

    portal: list[dict] = []
    for p in sb_get(env, "err_projects", "id,banking_details,intended_beneficiaries"):
        if p.get("banking_details"):
            for name in extract_names_banking(p["banking_details"]):
                if sum(Counter(tokens(name)).values()) < 2:
                    continue
                portal.append(
                    {
                        "name": name,
                        "mkey": multiset_key(name),
                        "dates": extract_dates(p["banking_details"]),
                        "source": "banking",
                        "id": p["id"],
                    }
                )
    for m in sb_get(env, "mous", "id,partner_name,banking_details_override"):
        if m.get("partner_name") and sum(Counter(tokens(m["partner_name"])).values()) >= 2:
            portal.append(
                {
                    "name": m["partner_name"],
                    "mkey": multiset_key(m["partner_name"]),
                    "dates": [],
                    "source": "mou_partner",
                    "id": m["id"],
                }
            )
        if m.get("banking_details_override"):
            for name in extract_names_banking(m["banking_details_override"]):
                if sum(Counter(tokens(name)).values()) < 2:
                    continue
                portal.append(
                    {
                        "name": name,
                        "mkey": multiset_key(name),
                        "dates": extract_dates(m["banking_details_override"]),
                        "source": "mou_banking",
                        "id": m["id"],
                    }
                )

    name_hits: list[dict] = []
    date_hits: list[dict] = []
    weak_set_hits: list[dict] = []

    for p in portal:
        pset = frozenset(t for t, _ in p["mkey"])
        for s in by_set.get(pset, []):
            if not full_legal_name_match(p["name"], s["name"]):
                if len(pset) >= 2:
                    weak_set_hits.append({"portal": p, "sanction": s})
                continue
            best = None
            for pd in p["dates"]:
                for sd in s["dates"]:
                    t = date_match_type(pd, sd)
                    if t:
                        rank = {"full": 3, "month_year": 2, "day_month": 1}
                        if not best or rank[t] > rank[best[0]]:
                            best = (t, pd, sd)
            rec = {"portal": p, "sanction": s, "date_match": best}
            if best:
                date_hits.append(rec)
            else:
                name_hits.append(rec)

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    report = {
        "strict_full_legal_name_only": name_hits,
        "strict_full_legal_name_with_date": date_hits,
        "weak_same_token_set": weak_set_hits[:50],
        "stats": {
            "portal_unique_names": len({p["mkey"] for p in portal}),
            "portal_with_dates_in_banking": sum(1 for p in portal if p["dates"]),
            "sanction_entries": len(sanctions),
        },
    }
    with open(OUTPUT, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)

    print("Strict full legal name + date screen")
    print(f"  Portal unique payee names: {report['stats']['portal_unique_names']}")
    print(f"  Portal banking texts with dates: {report['stats']['portal_with_dates_in_banking']}")
    print(f"  Full name + date pattern: {len(date_hits)}")
    print(f"  Full name only: {len(name_hits)}")
    print(f"  Weak (same words, different count): {len(weak_set_hits)}")
    print(f"  Report: {OUTPUT}")


if __name__ == "__main__":
    main()
