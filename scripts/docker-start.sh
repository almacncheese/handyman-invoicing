#!/bin/sh
set -eu
# Apply migrations before serving (Coolify/prod). Fail closed if DB unreachable.
npx prisma migrate deploy
exec npm run start
