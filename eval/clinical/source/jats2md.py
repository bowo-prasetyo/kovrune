#!/usr/bin/env python3
"""Builds the clinical suite's documents (eval/clinical/docs/*.md) from Europe PMC's full-text XML.

Each article is open access under CC BY 4.0, and its text is kept as published: the title, authors,
licence, abstract, sections, tables (one Markdown row per table row) and references. Figures are kept
as their captions only. Nothing is reworded. Run from the repository root:

    python3 eval/clinical/source/jats2md.py            # downloads the XML of each PMCID below
    python3 eval/clinical/source/jats2md.py --xml DIR  # uses DIR/<PMCID>.xml instead

Europe PMC's PDFs sit behind a browser check, so the suite reads the articles as text, not as PDFs.
"""

import argparse
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

# PMCID -> document file name (without .md). Order is the order of eval/clinical/tasks.ts.
ARTICLES = {
    "PMC10850983": "typhoid-vaccine-malawi",
    "PMC10193370": "iv-iron-pregnancy-malawi",
    "PMC10865779": "ipt-malaria-pregnancy",
    "PMC11367748": "cruciferous-blood-pressure",
    "PMC11392261": "copcov-hydroxychloroquine",
    "PMC11650848": "folic-acid-pregnancy",
    "PMC11542398": "azithromycin-severe-malaria",
    "PMC11590543": "carrageenan-insulin",
    "PMC11533403": "betamethasone-50-years",
    "PMC11407643": "crp-community-health-workers",
}

API = "https://www.ebi.ac.uk/europepmc/webservices/rest/{}/fullTextXML"
BLOCK = {"p", "title", "sec", "list", "list-item", "table-wrap", "fig", "caption", "label", "ref", "def-list"}


def text(el) -> str:
    """The text of an element, inline markup flattened; a citation is written in brackets."""
    if el is None:
        return ""
    parts = [el.text or ""]
    for child in el:
        if child.tag == "xref" and child.get("ref-type") == "bibr":
            # A citation in brackets in the source ("[1–3]") keeps them; one without (The Lancet's
            # superscripts) gets its own, so its number does not join the sentence's last word.
            before = "".join(parts)
            inside = before.count("[") > before.count("]")
            parts.append(text(child) if inside else f"[{text(child)}]")
        elif child.tag in ("table-wrap", "fig", "list", "disp-formula"):
            pass  # rendered as blocks of their own
        else:
            parts.append(text(child))
        parts.append(child.tail or "")
    return "".join(parts)


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def table(wrap) -> list[str]:
    lines = [f"**{clean(text(wrap.find('label')))}** {clean(text(wrap.find('caption')))}".strip(), ""]
    for row in wrap.iter("tr"):
        cells = [clean(text(c)) for c in row if c.tag in ("td", "th")]
        if any(cells):
            lines.append("| " + " | ".join(cells) + " |")
    foot = wrap.find("table-wrap-foot")
    if foot is not None:
        lines += ["", clean(text(foot))]
    return lines + [""]


def list_lines(el) -> list[str]:
    return ["- " + clean(text(item)) for item in el.iter("list-item")] + [""]


def blocks(el, depth: int) -> list[str]:
    out: list[str] = []
    for child in el:
        tag = child.tag
        if tag == "title":
            out += ["#" * min(depth, 6) + " " + clean(text(child)), ""]
        elif tag == "sec":
            out += blocks(child, depth + 1)
        elif tag == "p":
            para = clean(text(child))
            if para:
                out += [para, ""]
            for nested in child:
                if nested.tag == "table-wrap":
                    out += table(nested)
                elif nested.tag == "list":
                    out += list_lines(nested)
        elif tag == "list":
            out += list_lines(child)
        elif tag == "table-wrap":
            out += table(child)
        elif tag == "fig":
            out += [f"*{clean(text(child.find('label')))}: {clean(text(child.find('caption')))}*", ""]
        elif tag in ("boxed-text", "abstract"):
            out += blocks(child, depth)
    return out


def article_md(root) -> str:
    meta = root.find(".//article-meta")
    title = clean(text(meta.find(".//article-title")))
    authors = []
    for contrib in meta.findall("contrib-group/contrib"):
        if contrib.get("contrib-type", "author") != "author":
            continue
        name = contrib.find("name")
        if name is not None:
            authors.append(clean(f"{text(name.find('given-names'))} {text(name.find('surname'))}"))
        elif contrib.find("collab") is not None:
            authors.append(clean(contrib.find("collab").text or ""))  # its members are listed on their own
    journal = clean(text(root.find(".//journal-title")))
    year = clean(text(meta.find(".//pub-date/year")))
    doi = clean(text(meta.find(".//article-id[@pub-id-type='doi']")))
    pmcid = clean(text(meta.find(".//article-id[@pub-id-type='pmcid']")))
    permissions = meta.find(".//permissions")
    licence = " ".join(clean(text(e)) for e in permissions.iter() if e.tag in ("copyright-statement", "license-p"))
    lines = [f"# {title}", "", ", ".join(authors) + ".", "", f"{journal} ({year}). DOI: {doi}. {pmcid}.", "", licence, ""]
    for abstract in meta.findall("abstract"):
        if abstract.get("abstract-type") in ("graphical", "teaser", "toc"):
            continue
        heading = clean(text(abstract.find("title"))) or "Abstract"
        lines += [f"## {heading}", ""]
        rest = [c for c in abstract if c.tag != "title"]
        holder = ET.Element("x")
        holder.extend(rest)
        lines += blocks(holder, 2)
    body = root.find("body")
    if body is not None:
        lines += blocks(body, 1)
    back = root.find("back")
    if back is not None:
        for part in back:
            if part.tag == "ref-list":
                lines += ["## References", ""]
                for n, ref in enumerate(part.iter("ref"), 1):
                    label = clean(text(ref.find("label"))) or str(n)
                    cite = ref.find("mixed-citation")
                    if cite is None:
                        cite = ref.find("element-citation")
                    lines.append(f"{label}. {clean(text(cite))}")
                lines.append("")
            elif part.tag in ("ack", "sec", "notes", "fn-group"):
                lines += blocks(part, 1)
    md = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", md).strip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", type=Path, help="a folder holding <PMCID>.xml, instead of downloading")
    args = parser.parse_args()
    out = Path(__file__).resolve().parent.parent / "docs"
    out.mkdir(exist_ok=True)
    for pmcid, name in ARTICLES.items():
        if args.xml:
            data = (args.xml / f"{pmcid}.xml").read_bytes()
        else:
            with urllib.request.urlopen(API.format(pmcid), timeout=60) as response:
                data = response.read()
        root = ET.fromstring(data)
        lic = ET.tostring(root.find(".//permissions"), encoding="unicode")
        if "creativecommons.org/licenses/by/4.0" not in lic:
            sys.exit(f"{pmcid}: not CC BY 4.0, not used")
        (out / f"{name}.md").write_text(article_md(root), encoding="utf-8")
        print(f"{pmcid} -> eval/clinical/docs/{name}.md")


if __name__ == "__main__":
    main()
