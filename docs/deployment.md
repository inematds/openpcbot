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
sudo nano /etc/systemd/system/openpcbot.service
```

```ini
[Unit]
Description=OpenPCBot Telegram Bot
After=network.target

[Service]
Type=simple
User=nmaldaner
WorkingDirectory=/home/nmaldaner/projetos/openpcbot
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
sudo systemctl enable openpcbot
sudo systemctl start openpcbot
```

### Useful commands

```bash
sudo systemctl status openpcbot    # check status
sudo systemctl restart openpcbot   # restart
sudo systemctl stop openpcbot      # stop
journalctl -u openpcbot -f         # follow logs
```

## Option 2 — pm2

```bash
npm i -g pm2
npm run build
pm2 start dist/index.js --name openpcbot
pm2 startup    # generate auto-start script
pm2 save       # save process list
```

### Useful commands

```bash
pm2 status          # check status
pm2 logs openpcbot  # view logs
pm2 restart openpcbot
pm2 stop openpcbot
```

## Ollama as a service

Ollama also needs to be running. If not already a service:

```bash
sudo systemctl enable ollama
sudo systemctl start ollama
```

Or manually: `ollama serve &`
