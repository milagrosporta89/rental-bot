# Deploy — Rental Bot

## Infraestructura

- **Servidor:** Google Cloud e2-micro (us-central1) — Always Free
- **Bot:** Node.js + PM2
- **CI/CD:** GitHub Actions (deploy automático en cada push)

---

## Deploy de cambios

```bash
git add .
git commit -m "descripcion del cambio"
git push
```

GitHub Actions compila el TypeScript y lo despliega automáticamente en ~2 minutos.
Podés seguir el progreso en: `github.com/milagrosporta89/rental-bot/actions`

---

## Comandos útiles en el servidor

Conectarse via SSH: Google Cloud Console → Compute Engine → VM instances → SSH

```bash
# Ver estado del bot
pm2 status

# Ver logs en tiempo real
pm2 logs rental-bot

# Reiniciar el bot
pm2 restart rental-bot

# Detener el bot
pm2 stop rental-bot
```

---

## Variables de entorno

El archivo `.env` vive en el servidor en:
```
~/rental-bot/rental-bot/.env
```

Para editar:
```bash
nano ~/rental-bot/rental-bot/.env
```

Variables necesarias:
```
TELEGRAM_BOT_TOKEN=
ANTHROPIC_API_KEY=
GOOGLE_SHEET_ID=
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

Después de cambiar variables, reiniciar el bot:
```bash
pm2 restart rental-bot
```

---

## GitHub Secrets (para CI/CD)

En `github.com/milagrosporta89/rental-bot/settings/secrets/actions`:

| Secret | Descripción |
|--------|-------------|
| `SSH_HOST` | IP externo de la VM (34.70.187.196) |
| `SSH_USERNAME` | Usuario SSH (milagrosporta89) |
| `SSH_PRIVATE_KEY` | Clave privada RSA en base64 |

---

## Si el bot se cae

```bash
pm2 restart rental-bot
pm2 logs rental-bot --lines 50
```

Si el servidor se reinició y el bot no arrancó solo:
```bash
pm2 resurrect
```
