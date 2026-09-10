# Scripts

- `seed_demo.py` inserts three demo scans for a non-empty dashboard.
- `run_eval.py` evaluates the rule engine against the hand-labeled eval CSV.
- `backup_db.py` creates a timestamped, WAL-safe SQLite backup while the backend is running:

	```bash
	cd backend
	.venv/bin/python -m scripts.backup_db --backup-dir /srv/errorist/backups
	```
