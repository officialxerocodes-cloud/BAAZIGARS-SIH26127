"""Fetch Pune Shivajinagar/Deccan drive network (ARCHITECTURE.md §3 bbox) as OSM XML for netconvert."""
import osmnx as ox
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "sim" / "data" / "pune_bbox.osm.xml"
OUT.parent.mkdir(parents=True, exist_ok=True)

# ARCHITECTURE.md §3: 18.515–18.535 lat, 73.83–73.86 lon
# osmnx 2.x bbox order = (west, south, east, north) = (left, bottom, right, top)
west, south, east, north = 73.83, 18.515, 73.86, 18.535

print(f"downloading drive network bbox W{west} S{south} E{east} N{north} ...")
G = ox.graph_from_bbox(bbox=(west, south, east, north), network_type="drive", simplify=False)
print(f"graph: {len(G.nodes)} nodes, {len(G.edges)} edges")

ox.save_graph_xml(G, filepath=str(OUT), encoding="utf-8")
print(f"saved {OUT} ({OUT.stat().st_size/1e6:.1f} MB)")
