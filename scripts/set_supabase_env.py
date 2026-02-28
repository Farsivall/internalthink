#!/usr/bin/env python3
"""
Update .env with Supabase URL (and optionally service_role key).
Run after getting URL from Supabase MCP: get_project_url

Usage:
  python scripts/set_supabase_env.py https://YOUR_PROJECT_REF.supabase.co
  python scripts/set_supabase_env.py https://xxx.supabase.co YOUR_SERVICE_ROLE_KEY
"""
import os
import sys

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/set_supabase_env.py <SUPABASE_URL> [SERVICE_ROLE_KEY]")
        sys.exit(1)
    url = sys.argv[1].strip()
    service_key = sys.argv[2].strip() if len(sys.argv) > 2 else None

    if not os.path.exists(ENV_PATH):
        print(f".env not found at {ENV_PATH}")
        sys.exit(1)

    with open(ENV_PATH, "r") as f:
        lines = f.readlines()

    out = []
    has_url = has_key = False
    for line in lines:
        if line.startswith("SUPABASE_URL="):
            out.append(f"SUPABASE_URL={url}\n")
            has_url = True
        elif line.startswith("SUPABASE_SERVICE_ROLE_KEY=") and service_key:
            out.append(f"SUPABASE_SERVICE_ROLE_KEY={service_key}\n")
            has_key = True
        else:
            out.append(line)

    if not has_url:
        out.append(f"SUPABASE_URL={url}\n")
    if service_key and not has_key:
        out.append(f"SUPABASE_SERVICE_ROLE_KEY={service_key}\n")

    with open(ENV_PATH, "w") as f:
        f.writelines(out)
    print(f"Updated .env: SUPABASE_URL={url[:50]}...")
    if service_key:
        print("Updated .env: SUPABASE_SERVICE_ROLE_KEY=***")


if __name__ == "__main__":
    main()
