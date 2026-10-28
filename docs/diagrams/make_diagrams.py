"""Draws the README's "around the browser" and "a task, step by step" diagrams as SVG, in the same style as
architecture.svg and agent-loop.svg (GitHub shows SVG images everywhere, including its phone app, unlike Mermaid).

  python3 docs/diagrams/make_diagrams.py
"""
from pathlib import Path
from xml.sax.saxutils import escape

HERE = Path(__file__).parent
BLUE, GREEN, RED, AMBER, INK, GREY, EDGE = "#1d63ed", "#1a7f45", "#c4361a", "#d97706", "#0e0f12", "#4b4a50", "#9fb0c8"

HEAD = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eaf3fd"/><stop offset="1" stop-color="#f8fbff"/></linearGradient>
  <filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0a1e46" flood-opacity=".10"/></filter>
  <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#9fb0c8"/></marker>
  <style>
    .t{{fill:#0e0f12;font-weight:700;font-size:17px}} .s{{fill:#4b4a50;font-size:13.5px}} .lab{{fill:#5b6170;font-size:12.5px;font-weight:600}}
    .edge{{fill:none;stroke:#9fb0c8;stroke-width:1.6}} .flow{{fill:none;stroke-width:2.2;stroke-dasharray:6 10;animation:run 1.6s linear infinite}}
    .life{{stroke:#c9d4e3;stroke-width:1.4;stroke-dasharray:4 6}}
    @keyframes run{{to{{stroke-dashoffset:-32}}}}
  </style>
</defs>
<rect width="{w}" height="{h}" rx="28" fill="url(#sky)"/>
<text x="40" y="54" style="fill:#0e0f12;font-size:26px;font-weight:800;letter-spacing:-.02em">{title}</text>
<text x="40" y="80" class="s" style="font-size:14px">{sub}</text>
"""


def box(x, y, w, h, title, lines, color=None, n=None):
    stroke = color or "#d6deea"
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20" fill="#fff" stroke="{stroke}" stroke-width="{2 if color else 1.5}" filter="url(#sh)"/>']
    tx = x + 20
    if n is not None:
        out.append(f'<circle cx="{x + 32}" cy="{y + 32}" r="14" fill="{color or BLUE}"/><text x="{x + 32}" y="{y + 37}" text-anchor="middle" style="fill:#fff;font-weight:800;font-size:13px">{n}</text>')
        tx = x + 54
    out.append(f'<text x="{tx}" y="{y + 38}" class="t">{escape(title)}</text>')
    for i, line in enumerate(lines):
        out.append(f'<text x="{x + 20}" y="{y + 70 + i * 22}" class="s">{escape(line)}</text>')
    return "\n".join(out)


def arrow(d, color=BLUE, label=None, lx=0, ly=0, dashed_only=False):
    out = [f'<path d="{d}" class="edge" marker-end="url(#arr)"/>']
    if not dashed_only:
        out.append(f'<path d="{d}" class="flow" style="stroke:{color}"/>')
    if label:
        out.append(f'<text x="{lx}" y="{ly}" class="lab" text-anchor="middle">{escape(label)}</text>')
    return "\n".join(out)


def around_the_browser():
    W, H = 1280, 740
    p = [HEAD.format(w=W, h=H, title="Around the browser · what happens to every page",
                     sub="Jagora drives a real Chromium for each person. Every request is checked, the page is read again after every action, and she watches it live.")]
    # row A: every request
    p.append(box(40, 120, 230, 150, "Route interceptor", ["Every request the", "page makes"], n=1))
    p.append(box(320, 120, 240, 150, "Site guard", ["Blocklists, lookalike", "domains, scam schemes"], color=RED, n=2))
    p.append(box(610, 120, 210, 150, "Live page", ["Chromium, one per", "person (Playwright)"], color=GREEN, n=3))
    p.append(box(870, 120, 370, 150, "Kept out", ["Blocked site: a page that says why", "Ads and trackers: cut off", "Pop-up tabs closed, downloads cancelled", "Zoom locked, permission requests refused"]))
    p.append(arrow("M272 195 L318 195"))
    p.append(arrow("M562 195 L608 195", GREEN, "allowed", 585, 185))
    p.append(arrow("M822 195 L868 195", RED))
    # row B: one agent step
    p.append(box(40, 330, 280, 180, "Snapshot", ["1 hide invisible text", "2 number every control", "3 screenshot with marks", "4 page content verdict", "5 cut out orders to AI"], n=4))
    p.append(box(370, 330, 230, 180, "Muse Spark 1.3", ["Reads the snapshot and", "her words, and picks", "the next steps", "(57 tools)"], color=BLUE, n=5))
    p.append(box(650, 330, 250, 180, "Safety gate", ["Action check against", "her request", "Submit, pay, send:", "her yes first"], color=RED, n=6))
    p.append(box(950, 330, 290, 180, "Act", ["Click, type, drag, upload", "Typed values read back", "Fallbacks when a click", "does not land"], color=GREEN, n=7))
    p.append(arrow("M715 272 L715 300 L180 300 L180 326"))
    p.append(arrow("M322 420 L368 420"))
    p.append(arrow("M602 420 L648 420", RED))
    p.append(arrow("M902 420 L948 420", GREEN))
    # row C: what she sees
    p.append(box(40, 570, 290, 140, "Her screen", ["Video decoded on her phone", "Swipe to scroll, take over"], color=BLUE, n=10))
    p.append(box(380, 570, 230, 140, "WebSocket", ["Binary frames and", "Jagora's voice"], n=9))
    p.append(box(660, 570, 250, 140, "Live view", ["H.264 video, 8 a second,", "only when the page changes"], n=8))
    p.append(box(960, 570, 280, 140, "Also in the page", ["PDF viewer: find text, crops", "Pages shown in her language,", "the original always read"]))
    p.append(arrow("M1095 512 L1095 540 L785 540 L785 566", GREEN, "the page changes", 945, 532))
    p.append(arrow("M658 640 L612 640", BLUE))
    p.append(arrow("M378 640 L332 640", BLUE))
    p.append("</svg>")
    (HERE / "around-browser.svg").write_text("\n".join(p))


def task_steps():
    lanes = ["Bisi (Yorùbá)", "Jagora app", "Agent server", "STORM speech", "Muse Spark", "Guard and gate", "UNILAG site"]
    colors = [GREEN, BLUE, INK, AMBER, BLUE, RED, GREY]
    x0, dx = 120, 173
    X = [x0 + i * dx for i in range(len(lanes))]
    steps = [
        (0, 1, "Ṣàyẹ̀wò àwọn ìlànà UNILAG fún Computer Science", False),
        (1, 2, "her voice, once she has finished speaking", False),
        (2, 3, "transcribe (Yorùbá)", False),
        (2, 4, "her goal, the page and the tools", False),
        (4, 5, "go_to the official brochure", False),
        (5, 6, "allowed: official .edu.ng site", False),
        (2, 1, "the live page, as video", True),
        (4, 2, "find_text, then show_evidence", False),
        (2, 1, "evidence card with the exact line highlighted", True),
        (4, 2, "finish", False),
        (2, 4, "independent checker: is it really done?", False),
        (2, 3, "speak the answer in Morenike's voice", False),
        (3, 0, "the answer, in Yorùbá", True),
    ]
    top, row = 190, 46
    H = top + len(steps) * row + 60
    W = 1280
    p = [HEAD.format(w=W, h=H, title="A task, step by step",
                     sub="Bisi asks in Yorùbá for UNILAG's Computer Science requirements. Proof first, then the answer in her own language.")]
    for x, name, c in zip(X, lanes, colors):
        p.append(f'<line x1="{x}" y1="{top - 30}" x2="{x}" y2="{H - 40}" class="life"/>')
        p.append(f'<rect x="{x - 80}" y="108" width="160" height="46" rx="16" fill="#fff" stroke="{c}" stroke-width="1.8" filter="url(#sh)"/>')
        p.append(f'<text x="{x}" y="137" text-anchor="middle" class="t" style="font-size:14.5px">{escape(name)}</text>')
    for i, (a, b, text, back) in enumerate(steps):
        y = top + i * row
        xa, xb = X[a], X[b]
        sgn = 1 if xb > xa else -1
        d = f"M{xa + sgn * 16} {y} L{xb - sgn * 6} {y}"
        color = GREEN if back else BLUE
        p.append(f'<path d="{d}" class="edge" marker-end="url(#arr)" {"stroke-dasharray=\"5 5\"" if back else ""}/>')
        p.append(f'<path d="{d}" class="flow" style="stroke:{color}"/>')
        p.append(f'<circle cx="{xa}" cy="{y}" r="12" fill="{color}"/><text x="{xa}" y="{y + 4.5}" text-anchor="middle" style="fill:#fff;font-weight:800;font-size:12px">{i + 1}</text>')
        # the label starts beside the step number, on the side the arrow goes
        lx, anchor = (xa + 20, "start") if sgn > 0 else (xa - 20, "end")
        p.append(f'<text x="{lx}" y="{y - 9}" text-anchor="{anchor}" class="lab" style="fill:#2a2c33;font-size:13px">{escape(text)}</text>')
    p.append("</svg>")
    (HERE / "task-steps.svg").write_text("\n".join(p))


if __name__ == "__main__":
    around_the_browser()
    task_steps()
    print("ok")
