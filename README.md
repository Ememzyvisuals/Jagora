# Jagora

The internet, in your own words. Jagora is a voice-first guide that uses websites for people who are more
comfortable speaking Yorùbá, Hausa, Igbo, Nigerian Pidgin or English than reading English websites.
It reads the page with you, shows you where to tap, and fills forms for you, asking before anything that commits.

Built for the Meta Global AI Developer Hackathon 2026.

## Repository

| Folder | What |
|---|---|
| `backend/` | Agent, browser control, safety gate, field rules, practice portals (Python) |
| `frontend/` | Web app (Next.js) |

## How Jagora uses Meta's models

| Model | Role |
|---|---|
| Muse Spark 1.3 | Reads the page (screenshot with numbered marks plus element list) and decides each step through tool calls |
| Muse Voice Transcribe | English speech to text |

## Safety

Every action the model proposes passes through plain code before it touches the page (`backend/jagora/safety.py`):

- Passwords, PINs, one-time codes, card details, BVN and NIN are never typed by Jagora. The user types them herself.
- Submitting, paying, sending, agreeing to terms, clearing a form or leaving the website waits for the user's yes.
- App installers are never opened.
- Phone numbers, emails, dates and names heard by speech recognition are converted by code, validated, and read back before they are typed.

## Backend quick start

```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[test]" && playwright install --with-deps chromium
cp .env.example .env   # then set META_API_KEY
pytest -q
python -m jagora.try_agent --lang yo --goal "Forúkọ mi sílẹ̀ fún Skills Fair, mo fẹ́ kọ́ bí wọ́n ṣe ń tún fóònù ṣe"
```

## Practice portals

`backend/portals/` holds fictional websites used for demos and evaluation. They are clearly marked as practice
sites, do not imitate any real organisation, and send nothing anywhere.

## Built before the hackathon

Listed here so judges can tell new work from existing work:

- STORM ASR and STORM TTS (PlotWeaver's Nigerian-language speech models), used through their APIs.

Everything else in this repository was written during the hackathon (from 26 October 2026).
