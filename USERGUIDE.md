# COMPLETE USER GUIDE — Versigent Harness Connector Layout Tool

For BOM engineers using AutoCAD / BricsCAD on Windows.
Written for complete beginners. Read it once, you'll never need it again.

================================================================================
PART A — ONE-TIME SETUP: put the tool on the internet
================================================================================

You do this **once**. After it's online, you and anyone you share the link with
can use it forever, from any browser.

Estimated time: 15 minutes.

YOU NEED:
  - A GitHub account (free) — sign up at https://github.com
  - The files in the "versigent-harness-tool" folder I built for you

STEP A1 — Create a free GitHub account (5 minutes)
--------------------------------------------------
1. Open https://github.com in your browser
2. Click "Sign up" (top right)
3. Enter your email — use your work email so it's professional
4. Create a password
5. Pick a username (e.g. your-name-verse)
6. Solve the puzzle, click Create account
7. GitHub sends a verification code to your email. Enter it.
8. Done. You have a GitHub account.

STEP A2 — Create a new repository (2 minutes)
--------------------------------------------
1. Once logged in, click the "+" icon in the top right → "New repository"
2. Fill in:
     Repository name:  versigent-harness-tool
     Description:     Versigent harness connector layout automation
     Public           (so anyone with the link can use it)
3. Tick "Add a README file" (optional but nice)
4. Click "Create repository"

You now have an empty repo. Time to upload the files.

STEP A3 — Upload all the project files (5 minutes)
--------------------------------------------------
1. In the project folder on your computer
   (the "versigent-harness-tool" folder I gave you), select ALL files.
   - On Windows: Ctrl+A selects all files in a folder
2. Drag them all into the GitHub page, on the area that says
   "Drag files here to add to your repository"
3. Wait until all files upload (~10 seconds — they're small, ~370 KB total)
4. At the bottom, in the "Commit changes" box:
     - Title: "Initial upload"
     - Click the green "Commit changes" button

You now have the files on GitHub. Time to make it a live website.

STEP A4 — Turn on GitHub Pages (1 minute)
----------------------------------------
1. In your repository page on GitHub, click the "Settings" tab (top right)
2. In the left sidebar, click "Pages"
3. Under "Build and deployment":
     - Source: "Deploy from a branch"
     - Branch: click "main" / "(root)" / "Save"
4. Wait 30 seconds.
5. Refresh the page. You'll see a banner at the top:
     "Your site is live at https://<your-username>.github.io/versigent-harness-tool/"

STEP A5 — Bookmark and share (1 minute)
---------------------------------------
1. Click the link to verify it works. You should see the Versigent logo, the
   "Harness Connector Layout Tool" header, and 4 numbered drop zones.
2. Bookmark it in your browser.
3. Share the link with anyone in your team — they can use it without
   installing anything.

================================================================================
PART B — DAILY USE: 30 seconds per drawing
================================================================================

This is what you do for every harness drawing you process.

YOU NEED:
  - The harness 2D drawing (a .dwg file in AutoCAD/BricsCAD)
  - The Excel cutting plan (.xlsx file)

STEP B1 — Save your drawing as DXF (10 seconds)
-----------------------------------------------
1. Open your harness drawing in AutoCAD or BricsCAD like you normally do
2. In the command line at the bottom, type:
        DXFOUT
   and press Enter
3. A "Save As" dialog appears. Pick a folder on your desktop.
   Name the file  source.dxf  (or any name you like, ending in .dxf)
4. Click Save
5. Close AutoCAD/BricsCAD (you don't need it for the next steps)

WHY: The browser can't read .dwg (closed format), but it can read .dxf (open).

STEP B2 — Open the website (3 seconds)
--------------------------------------
1. Open your browser (Chrome, Edge, Firefox — any works)
2. Go to your bookmarked link:
     https://<your-username>.github.io/versigent-harness-tool/

The page should show:
   - Top: Versigent logo + "Harness Connector Layout Tool"
   - "Runs entirely in your browser — your files never leave this device"
   - 4 numbered cards: Excel upload, DXF upload, Advanced settings, Automate

STEP B3 — Drop in your two files (5 seconds)
--------------------------------------------
1. Open Windows File Explorer
2. Find your two files:
     - cutting_plan.xlsx (your Excel cutting plan)
     - source.dxf (the file you saved in Step B1)
3. Drag cutting_plan.xlsx onto the first drop zone ("Drop your Excel cutting plan here")
   → The zone turns green with ✓ and shows the file name + size
4. Drag source.dxf onto the second drop zone ("Drop your DXF drawing here")
   → Same thing — green ✓ + file info

If you prefer to click instead of drag:
   - Click the drop zone → a file picker opens → select the file → Open

The "Automate" button at the bottom should now turn orange and say "Automate"
(it was grayed out before, saying "Upload both files first").

STEP B4 — Click Automate (1 second)
-----------------------------------
1. Click the orange "Automate" button

What happens (instantly):
   - The button shows a spinner ("Running…")
   - A "Result" section appears below
   - You see a summary like:
        "4 connector(s) found
         ✓ POS-01 → block CONN_TYPE_A at (100.0, 200.0)
         ✓ POS-02 → block CONN_TYPE_B at (220.0, 200.0)
         ✓ CONN-A1 → block CONN_TYPE_C at (100.0, 120.0)
         ✓ CONN-B2 → block CONN_TYPE_D at (220.0, 120.0)"
   - Below the summary: a big orange "Download output.dxf" button
   - Below that: a canvas preview showing your original drawing + a new row
     of 4 tables added below it (each table has the connector centered inside
     and the position name written above)

If anything goes wrong, see PART D (Troubleshooting).

STEP B5 — Download the output (1 second)
----------------------------------------
1. Click the orange "Download output.dxf" button
2. The file saves to your Downloads folder
   (name: source_layout.dxf — same as your input name + "_layout")

STEP B6 — Open output.dxf in AutoCAD/BricsCAD (5 seconds)
---------------------------------------------------------
1. Open AutoCAD or BricsCAD
2. Drag the downloaded output.dxf into the AutoCAD window
   OR: File → Open → find the file → Open
3. The drawing loads. You'll see:
   - Your original 2D harness drawing at the top
   - A new row of connector tables below it, on a layer called
     "VERSIGENT_LAYOUT" (each table = connector centered + position name above)

STEP B7 — Save as DWG (3 seconds)
---------------------------------
1. Press Ctrl+S (or File → Save As)
2. In the "Save As" dialog:
   - Files of type: pick "AutoCAD Drawing (*.dwg)"
   - Pick the folder where you want the final file
   - Name it (e.g. harness_layout_final.dwg)
3. Click Save
4. Done. Your final DWG is ready to send to your team / customer.

TOTAL TIME PER DRAWING: ~30 seconds
(versus 30 minutes to several hours doing it manually)

================================================================================
PART C — ADVANCED SETTINGS (when you need them)
================================================================================

By default, you don't touch these — the defaults work for 95% of cases.

To open: click the "▶ Advanced settings (optional)" line just below the two
drop zones. It expands to show 5 controls.

C1. SHEET (only appears if your Excel has multiple sheets)
----------------------------------------------------------
If your Excel workbook has multiple tabs (e.g. "Cover", "CuttingPlan", "Notes"),
the sheet selector appears automatically. Pick the sheet that holds your
cutting plan (usually "CuttingPlan").

If your Excel has only one sheet, this option is hidden — the tool uses that
one sheet automatically.

C2. POSITION COLUMN
--------------------
The dropdown shows all column headers from your Excel.
Pick the column that holds your position names (e.g. POS-01, CONN-A1).
The tool auto-selects "Position Name" if it finds that exact header, otherwise
it picks the first column.

Change this only if your column has a different name (e.g. "Item No.").

C3. SLOT WIDTH and SLOT HEIGHT (mm)
-----------------------------------
How big each connector table cell is, in millimetres.
Default: 60 × 50 mm — works for most automotive/harness connectors.

When to change:
  - If your connectors are tiny (e.g. 1-pin sensor connectors): try 40 × 30
  - If they're huge (e.g. 48-pin ECU connectors): try 100 × 80
  - Rule of thumb: cell size = connector size + ~20mm margin

C4. SEARCH BELOW (mm)
---------------------
How far below the position-name text to look for the connector block.
Default: 50mm.

When to change:
  - If a connector isn't being found (warning says "block too far"):
    increase to 100 or 200
  - If the wrong connector is being picked (a different block is closer):
    decrease to 20 or 30

C5. SEARCH LEFT/RIGHT (mm)
--------------------------
How far left and right of the position-name text to look.
Default: 100mm.

When to change:
  - Same as Search Below — increase if "block too far", decrease if wrong
    block is being picked.

C6. GAP BETWEEN CELLS (mm)
-------------------------
Horizontal gap between each connector table in the new row.
Default: 10mm.

You rarely need to change this.

C7. RESET TO DEFAULTS
---------------------
Click this to put all settings back to the defaults (60, 50, 50, 100, 10).

================================================================================
PART D — TROUBLESHOOTING (when something goes wrong)
================================================================================

D1. "No connectors found" — all positions are red ✕
---------------------------------------------------
Causes (check in this order):
  1. The position names in Excel don't match the text in the CAD drawing
     → Open your CAD drawing, click on the position-name text, look at the
       exact string (e.g. "POS-01" with a hyphen, not "POS_01" with underscore)
     → Compare to your Excel cell — they must match (case doesn't matter;
       POS-01 = pos-01 = Pos-01)
  2. The text in CAD is not a TEXT entity (it might be MTEXT with extra
     annotation like "POS-01 (front harness)")
     → The tool handles this if "POS-01" is at the start, but if it's wrapped
       like "[1] POS-01" it won't match. Edit the Excel to include the prefix:
       "[1] POS-01"
  3. You picked the wrong "Position column" in Advanced settings
     → Open Advanced settings, change the dropdown, re-run

D2. "block too far — increase Search range"
------------------------------------------
The text was found, but no block is within the search region around it.
Fix:
  - Open Advanced settings
  - Increase "Search below" to 100 or 200
  - Increase "Search left/right" to 200
  - Re-run

D3. "block named 'X' is referenced but not defined (may be an XREF)"
-------------------------------------------------------------------
The block exists in the source drawing as an external reference (XREF),
not as a regular block. The tool can't copy it because the block definition
isn't in the DXF file itself.
Fix:
  - In AutoCAD, before saving as DXF, use the command  XBIND  to bind all XREFs
    into the drawing
  - Re-save as DXF
  - Re-run the tool

D4. The wrong connector is being picked
---------------------------------------
Two blocks are inside the search region; the wrong one is closer to the text.
Fix:
  - Open Advanced settings
  - Decrease "Search left/right" to 30 or 50 (tighter search)
  - Re-run

D5. Excel says "Position column" is disabled / shows "Upload Excel first"
------------------------------------------------------------------------
The Excel file failed to load. Causes:
  - The file is not really an Excel file (e.g. someone renamed a CSV to .xlsx)
  - The file is corrupted
  - The file is password-protected (the tool can't read protected files)

Fix:
  - Open the Excel in Excel, save it again as .xlsx (no password)
  - Re-drag it into the tool

D6. The "Automate" button stays disabled ("Upload both files first")
--------------------------------------------------------------------
One of the drop zones didn't recognize the file. Causes:
  - You dropped a .png or .pdf instead of .dxf (the tool rejects these)
  - You dropped a .docx instead of .xlsx
Fix:
  - Click the ✕ on the bad drop zone to clear it
  - Re-drop the correct file

D7. The canvas preview shows the original drawing but no new tables
-------------------------------------------------------------------
Possible causes:
  - The Automate button wasn't clicked (the new tables only appear after
    Automate runs successfully — see the result summary above the canvas)
  - 0 connectors were found (see D1)

D8. AutoCAD says "Invalid DXF" or "Drawing is not valid"
--------------------------------------------------------
This means the output DXF text was malformed. Causes:
  - The original source DXF was edited by hand and is invalid
  - You opened the source DXF in Notepad and modified it before running
    the tool — don't do that; always start from a fresh DXFOUT export
Fix:
  - Re-export source.dxf from AutoCAD/BricsCAD (DXFOUT)
  - Re-drag, re-run

D9. Multi-sheet Excel only sees the first sheet
-----------------------------------------------
By default the tool uses the first sheet. If your cutting plan is on a
different sheet:
  - Open Advanced settings (click ▶)
  - Pick the right sheet from the "Sheet" dropdown
  - The "Position column" dropdown will re-populate with that sheet's columns
  - Re-run

D10. "Duplicate position name(s) skipped"
----------------------------------------
Your Excel has the same position name twice (e.g. POS-01 appears on rows 2
and 4). The tool skips the duplicate and only processes it once. A warning
appears in the result summary.

If you actually need both copies of the connector (rare), edit the Excel to
give them unique names like POS-01a and POS-01b.

================================================================================
PART E — TIPS FOR POWER USERS
================================================================================

E1. THE "VERSIGENT_LAYOUT" LAYER
-------------------------------
All new entities (cell rectangles, connector inserts, position-name text)
go on a dedicated layer called "VERSIGENT_LAYOUT". In AutoCAD/BricsCAD:
  - Open the Layer Properties Manager (LAYER command)
  - You'll see "VERSIGENT_LAYOUT" in the list
  - You can:
      - Toggle visibility (click the light bulb icon)
      - Change its color (right-click → Properties)
      - Lock it (so you don't accidentally move the new tables)
      - Delete all new entities in one click: select the layer → Delete

E2. PROCESS MULTIPLE DRAWINGS
----------------------------
The tool processes one drawing at a time. To do 10 drawings:
  1. Save all 10 as DXF (DXFOUT in AutoCAD) — one at a time
  2. For each: drag → Automate → Download
  3. Total time: 10 × 30 sec = 5 minutes
(This is faster than re-opening AutoCAD each time because the website stays
open in your browser.)

E3. RE-RUN WITH DIFFERENT SETTINGS
---------------------------------
After Automate runs, you can change Advanced settings and click Automate
again — it will re-run from the same source DXF, no need to re-upload.
Useful if you want to try a different slot size or see if widening the
search range finds a missed connector.

E4. KEYBOARD SHORTCUTS
---------------------
  - Tab — moves focus between drop zones, inputs, and buttons
  - Enter / Space — when a drop zone is highlighted, opens the file picker
  - Enter — when the Automate button is highlighted, runs the automation
  - Esc — closes the file picker dialog (browser-level)

E5. PRIVACY (important to know)
-------------------------------
Files never leave the user's browser. There is no upload to any server.
The tool is fully static — it's just HTML, CSS, JavaScript. The only
external dependency is the SheetJS library, loaded from a CDN on first visit
and cached afterward. You can verify this by:
  - Open the browser DevTools (F12) → Network tab
  - Run the tool — you'll see no network requests when you drop files
    or click Automate

E6. UPDATING THE TOOL
--------------------
If I send you a new version of any file (e.g. main.js), update it like this:
  1. Go to your GitHub repo
  2. Click on the file (e.g. main.js)
  3. Click the pencil icon (top right of the file view)
  4. Delete everything, paste the new content
  5. Click "Commit changes" at the bottom
  6. Wait 30 seconds — the live site updates automatically

E7. USE OFFLINE
---------------
Once you've loaded the page once (and the SheetJS CDN is cached), the page
works without internet. If you need guaranteed offline use, copy the entire
project folder to your desktop and open index.html directly — no internet
needed.

================================================================================
PART F — IF YOU GET STUCK
================================================================================

Run the tool with the SAMPLE files first to verify it works:
  1. Open index.html (or the live site)
  2. Drag sample_cutting_plan.xlsx into the first drop zone
  3. Drag sample_source.dxf into the second drop zone
  4. Click Automate — you should see "4 connector(s) found"
  5. Click Download — open the file in AutoCAD — you should see 4 tables

If the samples work but your real files don't, the issue is with your
real files, not the tool. Most common: the position names in your Excel
don't match the text in your CAD drawing exactly.

If even the samples don't work, your browser might be blocking the
JavaScript. Try a different browser (Chrome / Edge / Firefox / Safari).

================================================================================
END
================================================================================
