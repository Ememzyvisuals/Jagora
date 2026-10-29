import os

os.environ.setdefault("JAGORA_ALLOW_FILE", "1")  # tests open local practice pages from disk
os.environ.setdefault("JAGORA_NO_INGEST", "1")
os.environ.setdefault("SIGNUPS_OPEN", "true")  # the judging lock is tested on its own
