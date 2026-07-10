# Deployment Notes

## Coolify / Docker
- Use the Dockerfile
- Set env vars from .env.example
- Health check: /api/health

## Production
- Fail-closed config validation at boot
- Use managed Postgres (Neon/Supabase) or self-hosted

## CI/CD
GitHub Actions: install → lint/test → build → deploy preview