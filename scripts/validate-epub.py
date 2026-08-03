#!/usr/bin/env python3
import sys
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

CONTAINER = "META-INF/container.xml"
CONTAINER_NS = {"c": "urn:oasis:names:tc:opendocument:xmlns:container"}
OPF_NS = {"opf": "http://www.idpf.org/2007/opf"}
XHTML_NS = {"x": "http://www.w3.org/1999/xhtml"}
EPUB_NS = "http://www.idpf.org/2007/ops"

def fail(message):
    raise SystemExit(f"EPUB validation failed: {message}")

def main(path):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        if not infos or infos[0].filename != "mimetype": fail("mimetype is not the first entry")
        if infos[0].compress_type != zipfile.ZIP_STORED: fail("mimetype must be stored uncompressed")
        if archive.read("mimetype") != b"application/epub+zip": fail("invalid mimetype")
        names = set(archive.namelist())
        if CONTAINER not in names: fail("missing container.xml")
        container = ET.fromstring(archive.read(CONTAINER))
        rootfile = container.find(".//c:rootfile", CONTAINER_NS)
        if rootfile is None: fail("missing rootfile")
        opf_path = rootfile.attrib.get("full-path", "")
        if opf_path not in names: fail("missing OPF package")
        opf = ET.fromstring(archive.read(opf_path))
        manifest = {item.attrib.get("id"): item for item in opf.findall(".//opf:manifest/opf:item", OPF_NS)}
        if not any("cover-image" in item.attrib.get("properties", "").split() for item in manifest.values()): fail("missing cover-image property")
        nav = next((item for item in manifest.values() if "nav" in item.attrib.get("properties", "").split()), None)
        if nav is None: fail("missing EPUB3 nav item")
        spine = opf.find("opf:spine", OPF_NS)
        if spine is None or not spine.attrib.get("toc"): fail("missing NCX spine fallback")
        if "OEBPS/cover.xhtml" in names: fail("duplicate HTML cover page detected")
        base = PurePosixPath(opf_path).parent
        nav_path = str(base / nav.attrib["href"])
        nav_root = ET.fromstring(archive.read(nav_path))
        navs = nav_root.findall(".//x:nav", XHTML_NS)
        types = {node.attrib.get(f"{{{EPUB_NS}}}type") for node in navs}
        if "toc" not in types or "landmarks" not in types: fail("nav requires TOC and landmarks")
        for anchor in nav_root.findall(".//x:a", XHTML_NS):
            href = anchor.attrib.get("href", "")
            target, _, fragment = href.partition("#")
            target_path = str(base / target)
            if target_path not in names: fail(f"broken navigation target: {href}")
            if fragment and target_path.endswith((".xhtml", ".html")):
                target_root = ET.fromstring(archive.read(target_path))
                if not any(node.attrib.get("id") == fragment for node in target_root.iter()): fail(f"missing navigation anchor: {href}")
        for item in manifest.values():
            href = item.attrib.get("href")
            if href and str(base / href) not in names: fail(f"manifest target missing: {href}")
        for itemref in opf.findall(".//opf:spine/opf:itemref", OPF_NS):
            if itemref.attrib.get("idref") not in manifest: fail("spine references a missing manifest item")
    print(f"KDP EPUB structural validation passed: {path}")

if __name__ == "__main__":
    if len(sys.argv) != 2: raise SystemExit("usage: validate-epub.py BOOK.epub")
    main(sys.argv[1])
