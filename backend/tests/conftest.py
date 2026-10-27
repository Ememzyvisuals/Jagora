import os

os.environ.setdefault("JAGORA_ALLOW_FILE", "1")  # tests open local practice pages from disk
os.environ.setdefault("JAGORA_NO_INGEST", "1")
