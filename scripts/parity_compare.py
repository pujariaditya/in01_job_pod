"""Compare findings between job_engine and shadow Pi pod.

Reads agent_findings rows for both job_id and job_id+'_shadow' over the
last N hours, joins by cycle timestamp, computes per-cycle agreement.

Wave C cutover gate (verified in Wave E): agreement >= 99% over 48h of
parallel run.

Usage:
    python parity_compare.py --job-id <id> --hours 48 --dsn <pg_dsn>
"""
from __future__ import annotations

import argparse
import asyncio
import json

import asyncpg


async def _main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--job-id", required=True)
    p.add_argument("--hours", type=int, default=48)
    p.add_argument("--dsn", required=True)
    args = p.parse_args()

    pool = await asyncpg.create_pool(args.dsn)
    try:
        async with pool.acquire() as con:
            rows = await con.fetch(
                """
                SELECT cycle_min, market_id,
                    MAX(CASE WHEN job_id = $1 THEN decision END) AS d_engine,
                    MAX(CASE WHEN job_id = $2 THEN decision END) AS d_pi
                FROM (
                    SELECT
                        date_trunc('minute', cycle_started_at) AS cycle_min,
                        market_id,
                        job_id,
                        decision
                    FROM agent_findings
                    WHERE (job_id = $1 OR job_id = $2)
                      AND cycle_started_at > NOW() - ($3 * interval '1 hour')
                ) base
                GROUP BY cycle_min, market_id
                """,
                args.job_id, args.job_id + "_shadow", args.hours,
            )

        total = 0
        agree = 0
        diffs: list[dict] = []
        for r in rows:
            if r["d_engine"] is None or r["d_pi"] is None:
                continue
            total += 1
            if r["d_engine"] == r["d_pi"]:
                agree += 1
            else:
                diffs.append({
                    "cycle": r["cycle_min"].isoformat(),
                    "market": r["market_id"],
                    "engine": r["d_engine"],
                    "pi": r["d_pi"],
                })
        rate = (agree / total * 100) if total else 0.0
        print(f"agreement: {agree}/{total} = {rate:.2f}%")
        if diffs:
            print(f"first 10 disagreements:\n{json.dumps(diffs[:10], indent=2)}")
        return 0 if rate >= 99.0 else 1
    finally:
        await pool.close()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
