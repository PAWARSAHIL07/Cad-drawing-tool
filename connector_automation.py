"""
connector_automation.py
=======================
BOM Engineer's connector-layout automation.

WHAT THIS DOES
--------------
1. Reads a list of position names from an Excel cutting plan.
2. Opens a 2D CAD drawing saved as DXF.
3. For each position name, finds the matching TEXT in the drawing,
   then finds the connector BLOCK sitting near that text (left, right,
   above-left — wherever it is).
4. Builds a NEW row of tables below the original drawing:
   each table = a rectangle + the connector block centered + the position name.
5. Saves everything as a new DXF. Open it in AutoCAD / BricsCAD, save as DWG.

==========================================================================
HOW TO USE ON YOUR REAL FILES  (read this once, then never again)
==========================================================================
STEP 0  (one-time setup on your PC, ~10 minutes)
   - Install Python 3.10+ from https://python.org  (tick "Add to PATH")
   - Open Command Prompt and run:
        pip install ezdxf pandas openpyxl
   - Copy this script + the 2 dummy files into a working folder, e.g.:
        C:\\Harness\\automation\\

STEP 1  (every project, ~30 seconds of work)
   - Open your 2D drawing in AutoCAD / BricsCAD
   - Type  DXFOUT  and save it as  source.dxf  into the working folder
   - Put your real cutting plan Excel next to it and rename it to
        cutting_plan.xlsx
     (the script looks for a column called  Position Name  by default)

STEP 2  (run the script)
   - In Command Prompt:
        cd C:\\Harness\\automation
        python connector_automation.py
   - You get  output.dxf  in the same folder.

STEP 3  (tune, if needed)
   - Open  output.dxf  in AutoCAD / BricsCAD.
   - If the new row of tables is too high / too low / cells too small,
     change the 6 numbers in the CONFIG section below and re-run.
   - If a connector wasn't found, the script prints a warning telling
     you which position name it couldn't match — fix the spelling in
     Excel or check the text in the CAD file.

==========================================================================
CONFIG  — change ONLY these numbers to match your company's drawing style
==========================================================================
"""

# --- File paths (use raw strings r"..." on Windows so backslashes work) ---
EXCEL_PATH  = r"/home/z/my-project/download/cutting_plan.xlsx"
SOURCE_DXF  = r"/home/z/my-project/download/source.dxf"
OUTPUT_DXF  = r"/home/z/my-project/download/output.dxf"

# --- Excel column that holds the position names ---------------------------
POSITION_COLUMN = "Position Name"   # change to your column header if different

# --- Detection rules (all values in millimetres) ---------------------------
# How far to look AROUND the position-name text to find the connector.
SEARCH_BELOW      = 50    # how far below the text to search
SEARCH_ABOVE      = 10    # how far above the text to search (usually small)
SEARCH_LEFT_RIGHT = 100   # how far left and right of the text to search
# (Wide T-shaped region = handles connectors left, right, above, diagonal)

# --- Output layout (all values in millimetres) ----------------------------
SLOT_WIDTH  = 60    # width  of each connector table cell
SLOT_HEIGHT = 50    # height of each connector table cell
SLOT_GAP    = 10   # horizontal gap between cells
ROW_MARGIN_BOTTOM = 30   # how far below the lowest geometry the new row starts
ROW_MARGIN_LEFT   = 40   # left margin where the new row starts
TEXT_HEIGHT_OUT   = 4    # height of the position-name text in the new layout


# ==========================================================================
#  DO NOT EDIT BELOW THIS LINE unless you know what you're doing.
# ==========================================================================

import sys
import math
import pandas as pd
import ezdxf
from ezdxf.enums import TextEntityAlignment


def read_positions(excel_path, column_name):
    """Read the position names from the Excel file."""
    df = pd.read_excel(excel_path)
    if column_name not in df.columns:
        print(f"ERROR: column '{column_name}' not found in Excel.")
        print(f"Columns available: {list(df.columns)}")
        sys.exit(1)
    positions = df[column_name].dropna().astype(str).str.strip().tolist()
    print(f"Read {len(positions)} positions from Excel: {positions}")
    return positions


def find_text_entity(msp, name):
    """Find the first TEXT or MTEXT entity whose string exactly matches `name`."""
    for e in msp:
        if e.dxftype() == "TEXT":
            if (e.dxf.text or "").strip() == name:
                return e
        elif e.dxftype() == "MTEXT":
            raw = e.dxf.text or ""
            # MTEXT can contain formatting codes; do a simple contains-match
            if name in raw:
                return e
    return None


def text_point(e):
    """Return the (x, y) insertion point of a TEXT or MTEXT entity."""
    p = e.dxf.insert  # for TEXT/MTEXT this is the insertion point
    return (p.x, p.y)


def block_insert_point(e):
    """Return the (x, y) insertion point of an INSERT (block reference)."""
    p = e.dxf.insert
    return (p.x, p.y)


def distance(p1, p2):
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def find_nearest_block_near_text(msp, text_xy):
    """
    Search a T-shaped region around `text_xy` for INSERT entities and
    return the nearest block reference, or None if nothing found.
    """
    tx, ty = text_xy
    # Search bounds
    x_min = tx - SEARCH_LEFT_RIGHT
    x_max = tx + SEARCH_LEFT_RIGHT
    y_min = ty - SEARCH_BELOW
    y_max = ty + SEARCH_ABOVE

    candidates = []
    for e in msp:
        if e.dxftype() != "INSERT":
            continue
        bx, by = block_insert_point(e)
        if x_min <= bx <= x_max and y_min <= by <= y_max:
            candidates.append((e, distance((bx, by), (tx, ty))))

    if not candidates:
        return None
    candidates.sort(key=lambda c: c[1])
    return candidates[0][0]


def drawing_extent_y_min(msp):
    """Return the lowest Y of any drawable entity (to place the new row below)."""
    from ezdxf import bbox
    bb = bbox.extents(msp, fast=True)
    if bb.has_data:
        return bb.extmin.y
    return 0


def build_layout(doc, msp, found, row_y, row_x):
    """
    Draw a horizontal row of tables. `found` is a list of dicts:
        { 'name': 'POS-01', 'block_name': 'CONN_TYPE_A', 'src_insert': (x, y) }
    """
    cur_x = row_x
    text_y = row_y + SLOT_HEIGHT + 5  # name above each cell

    for item in found:
        # 1. Draw the table cell (rectangle)
        x0, y0 = cur_x, row_y
        x1, y1 = cur_x + SLOT_WIDTH, row_y + SLOT_HEIGHT
        msp.add_lwpolyline([(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], close=True)

        # 2. Place the connector block in the centre of the cell
        if item.get("block_name"):
            cx = x0 + SLOT_WIDTH / 2
            cy = y0 + SLOT_HEIGHT / 2
            msp.add_blockref(item["block_name"], insert=(cx, cy))

        # 3. Add the position-name text above the cell
        t = msp.add_text(item["name"], height=TEXT_HEIGHT_OUT)
        t.set_placement((cx, text_y, 0), align=TextEntityAlignment.CENTER)

        cur_x += SLOT_WIDTH + SLOT_GAP


def main():
    print("=" * 60)
    print("Connector Layout Automation")
    print("=" * 60)

    # 1. Read Excel
    positions = read_positions(EXCEL_PATH, POSITION_COLUMN)

    # 2. Open source DXF
    try:
        doc = ezdxf.readfile(SOURCE_DXF)
    except Exception as ex:
        print(f"ERROR reading DXF: {ex}")
        sys.exit(1)
    msp = doc.modelspace()

    # 3. For each position, find text + nearest block
    found = []
    missing = []
    for name in positions:
        text_e = find_text_entity(msp, name)
        if text_e is None:
            print(f"  [MISS] text '{name}' not found in drawing")
            missing.append(name)
            continue
        t_xy = text_point(text_e)
        block_e = find_nearest_block_near_text(msp, t_xy)
        if block_e is None:
            print(f"  [MISS] no block found near text '{name}'")
            missing.append(name)
            continue
        block_name = block_e.dxf.name
        found.append({
            "name": name,
            "block_name": block_name,
            "src_insert": block_insert_point(block_e),
        })
        print(f"  [OK]   {name:10s} -> block '{block_name}' "
              f"at ({block_e.dxf.insert.x:.1f}, {block_e.dxf.insert.y:.1f})")

    if not found:
        print("No connectors found. Exiting.")
        sys.exit(1)

    # 4. Find where to put the new row (below the lowest existing geometry)
    y_lowest = drawing_extent_y_min(msp)
    row_y = y_lowest - ROW_MARGIN_BOTTOM - SLOT_HEIGHT
    row_x = ROW_MARGIN_LEFT

    print(f"\nPlacing {len(found)} tables at row Y = {row_y:.1f}, "
          f"starting X = {row_x:.1f}")

    # 5. Build the layout
    build_layout(doc, msp, found, row_y, row_x)

    # 6. Save
    doc.saveas(OUTPUT_DXF)
    print(f"\nSaved: {OUTPUT_DXF}")
    if missing:
        print(f"\nWARNING: {len(missing)} position(s) not found: {missing}")
    print("Done.")


if __name__ == "__main__":
    main()
