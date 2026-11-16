================================================================================
  CONNECTOR LAYOUT AUTOMATION — README
  For BOM Engineer using AutoCAD / BricsCAD on Windows
================================================================================

WHAT THIS PACKAGE CONTAINS
--------------------------
  connector_automation.py   <- THE script you run (your deliverable)
  cutting_plan.xlsx         <- DUMMY sample Excel (for testing only)
  source.dxf                <- DUMMY sample 2D drawing (for testing only)
  output.dxf                <- DUMMY result after running the script (PROOF it works)
  source_preview.png        <- Preview of what the dummy source looks like
  output_preview.png        <- Preview of what the output looks like (with the
                              new row of tables added below the original drawing)

PROOF IT WORKS
--------------
Open  output_preview.png  to see the result of running the script on the dummy
files. The top half is the original 2D drawing (4 connector blocks with their
position-name labels at different sides). The bottom half is the new row of
4 tables the script added automatically — each table has the connector centered
inside and the position name written above it. The red + marks are block
insertion points (visible only in this preview, not in AutoCAD).

================================================================================
HOW TO USE ON YOUR REAL COMPANY FILES
================================================================================

ONE-TIME SETUP ON YOUR WINDOWS PC (~10 minutes, only done once)
--------------------------------------------------------------
1. Install Python 3.10 or newer from  https://www.python.org/downloads/
   IMPORTANT: tick the box "Add Python to PATH" during install.

2. Open Command Prompt (press Windows key, type "cmd", Enter) and run:
        pip install ezdxf pandas openpyxl

3. Create a working folder, e.g.   C:\Harness\automation\
   Copy  connector_automation.py  into it.


EVERY NEW PROJECT (~30 seconds of work)
---------------------------------------
1. Open your 2D harness drawing in AutoCAD / BricsCAD.
2. Type  DXFOUT  in the command line, save it as:
        C:\Harness\automation\source.dxf
   (If your CAD has trouble with DXFOUT, also try File > Save As > DXF.)

3. Put your real cutting-plan Excel next to it and rename it to:
        C:\Harness\automation\cutting_plan.xlsx
   The Excel MUST have a column called  Position Name  (you can change this
   name in the CONFIG section of the script if your column is named differently).

4. In Command Prompt:
        cd C:\Harness\automation
        python connector_automation.py

5. You will get  output.dxf  in the same folder. Open it in AutoCAD / BricsCAD,
   check it, then File > Save As > DWG to get your final deliverable.


IF SOMETHING NEEDS TUNING
------------------------
Open  connector_automation.py  in Notepad (or any text editor). The top of the
file has a CONFIG section with these settings you can change:

  EXCEL_PATH        path to your Excel cutting plan
  SOURCE_DXF        path to your source DXF file
  OUTPUT_DXF        path where the result will be saved
  POSITION_COLUMN   the column header in Excel that holds position names
                    (default "Position Name"; change to match your sheet)

  SEARCH_BELOW      mm, how far below the text to look for the connector (50)
  SEARCH_ABOVE      mm, how far above the text to look (10)
  SEARCH_LEFT_RIGHT mm, how far left/right of the text to look (100)
                    (Wide region = handles connectors in any direction)

  SLOT_WIDTH        mm, width of each connector table cell (60)
  SLOT_HEIGHT       mm, height of each connector table cell (50)
  SLOT_GAP          mm, horizontal gap between cells (10)
  ROW_MARGIN_BOTTOM mm, distance below the original drawing for the new row (30)
  ROW_MARGIN_LEFT   mm, left margin for the new row (40)
  TEXT_HEIGHT_OUT   mm, height of position-name text in the new layout (4)

Edit ONLY these numbers, save the file, run the script again. Repeat until the
output looks right for your company standard. Once tuned, you never need to
touch them again.

================================================================================
HOW IT WORKS (under the hood — for your understanding)
================================================================================
1. Reads position names from Excel.
2. For each position name, scans every TEXT entity in the DXF and finds the
   one whose string matches exactly.
3. Defines a "T-shaped" search region around that text (below + left + right +
   a little above). This wide region is why the script finds the connector no
   matter which side the text is on.
4. Finds every BLOCK INSERT entity in that region and picks the NEAREST one
   to the text. That is the connector.
5. After all positions are found, the script computes the lowest Y of the
   original drawing and places a new horizontal row 30mm below it.
6. For each found connector, draws a rectangle (60x50mm) + inserts the block
   centered inside + writes the position name above.
7. Saves everything as output.dxf.

If a position name in Excel is not found in the CAD file (typo, missing text,
different naming), the script prints a [MISS] warning so you know which one
to fix.

================================================================================
TROUBLESHOOTING
================================================================================
Q: Script says "[MISS] text 'POS-01' not found in drawing"
A: Either the spelling in Excel doesn't match the CAD text exactly, OR the
   text in CAD is an MTEXT containing the position name with extra formatting.
   Open the CAD file, double-click the text, and copy the exact string into
   the Excel cell.

Q: Script says "[MISS] no block found near text 'POS-01'"
A: The connector is too far from the text. Increase SEARCH_BELOW and/or
   SEARCH_LEFT_RIGHT in the CONFIG.

Q: Block is found but the wrong connector is picked (a different block is closer)
A: Decrease SEARCH_LEFT_RIGHT and SEARCH_BELOW so the search region is tighter.

Q: New row of tables overlaps the original drawing
A: Increase ROW_MARGIN_BOTTOM (e.g. from 30 to 50).

Q: Cells are too small / connector doesn't fit
A: Increase SLOT_WIDTH and SLOT_HEIGHT.

Q: Can I run this on many drawings at once?
A: Yes — let me know and I'll add a batch mode that processes a folder of
   drawings + a folder of Excels and produces a folder of output DXFs.

================================================================================
PRIVACY
================================================================================
This script runs entirely on your PC. No data is sent anywhere. Your company
drawings never leave your machine.

================================================================================
