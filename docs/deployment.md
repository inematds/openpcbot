# Deployment Guide

## Prerequisites

- Node.js 20+
- `.env` configured (TELEGRAM_BOT_TOKEN, ALLOWED_CHAT_ID at minimum)
- Ollama running (`ollama serve`) with at least `qwen2.5:14b` pulled
- Project built: `npm run build`

## Quick start (manual)

```bash
./start.sh
```

## Option 1 — systemd (recommended for Linux)

### Create service file

```bash
sudo nano /etc/systemd/system/claudebot.service
```

```ini
[Unit]
Description=ClaudeClaw Telegram Bot
After=network.target

[Service]
Type=simple
User=nmaldaner
WorkingDirectory=/home/nmaldaner/projetos/openclaw3
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Enable and start

```bash
npm run build
sudo systemctl daemon-reload
sudo systemctl enable claudebot
sudo systemctl start claudebot
```

### Useful commands

```bash
sudo systemctl status claudebot    # check status
sudo systemctl restart claudebot   # restart
sudo systemctl stop claudebot      # stop
journalctl -u claudebot -f         # follow logs
```

## Option 2 — pm2

```bash
npm i -g pm2
npm run build
pm2 start dist/index.js --name claudebot
pm2 startup    # generate auto-start script
pm2 save       # save process list
```

### Useful commands

```bash
pm2 status          # check status
pm2 logs claudebot  # view logs
pm2 restart claudebot
pm2 stop claudebot
```

## Ollama as a service

Ollama also needs to be running. If not already a service:

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
```

Or manually: `ollama serve &`
