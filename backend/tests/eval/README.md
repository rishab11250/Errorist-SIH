# Eval set

30–50 hand-labeled product-label images with per-rule ground truth.

`eval_set.csv` uses: `image_id`, per-rule pass/evidence columns for the five MVP checks, and `notes`. Populate `images/` with the matching photos, then run:

```bash
cd backend && .venv/bin/python -m scripts.run_eval
```
