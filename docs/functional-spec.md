# Functional Spec

The MVP covers the core local-first set planning workflow:

- Import Apple Music XML.
- Persist normalized track metadata in SQLite.
- Run local feature analysis jobs.
- Detect or stub key data through the OpenKeyScan provider boundary.
- Normalize BPM, Camelot key, energy, and danceability.
- Select seed tracks.
- Generate one deterministic set draft with Beam Search.
- Display ordered tracks and transition rationales.
- Export JSON and CSV.

The MVP explicitly excludes Spotify, cloud sync, accounts, live deck integration, controller integration, Python sidecars, automatic library cleaning, and real-time next-track recommendation.
