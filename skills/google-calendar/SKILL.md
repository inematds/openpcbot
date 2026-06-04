---
name: google-calendar
description: Manage Google Calendar from Claude Code. Multi-account (inematds, nei2014, nei2024). Create events with Meet links, send invites, check availability, delete events.
allowed-tools: Bash(python3 ~/.config/calendar/gcal.py *)
---

# Google Calendar Skill

## Accounts

| Alias     | Email                        |
|-----------|------------------------------|
| inematds  | inematds@gmail.com (default) |
| nei2014   | nei.maldaner2014@gmail.com   |
| nei2024   | nei.maldaner2024@gmail.com   |

Always use `--account ALIAS` to target a specific account. Omit for default (inematds).

## Commands

### List upcoming events (one account)

```bash
python3 ~/.config/calendar/gcal.py list
python3 ~/.config/calendar/gcal.py --account nei2014 list --days 7
```

Returns JSON array: `id`, `summary`, `start`, `end`, `attendees`, `meet_link`, `account`.

### List from ALL accounts (aggregated, sorted by time)

```bash
python3 ~/.config/calendar/gcal.py list --all --days 14
```

### Get event details

```bash
python3 ~/.config/calendar/gcal.py --account nei2014 get <event_id>
```

### Create event

```bash
python3 ~/.config/calendar/gcal.py --account inematds create \
  --title "Reunião X" \
  --date 2026-05-20 \
  --time 14:00 \
  --duration 60 \
  --attendees "pessoa@exemplo.com,outro@exemplo.com" \
  --meet \
  --description "Pauta: ..."
```

Flags:
- `--title` (required)
- `--date YYYY-MM-DD` (required)
- `--time HH:MM` 24h, defaults to 09:00
- `--duration N` minutes (default 60)
- `--end-time HH:MM` alternative to duration
- `--description TEXT`
- `--attendees a@b.com,c@d.com` sends invites automatically
- `--meet` adds Google Meet link
- `--all-day` all-day event

### Update event

```bash
python3 ~/.config/calendar/gcal.py --account inematds update <event_id> \
  --field title --value "Novo Título"
```

Fields: `title`, `description`, `date` (YYYY-MM-DD).

### Delete event

```bash
python3 ~/.config/calendar/gcal.py --account nei2014 delete <event_id>
```

Sends cancellation notices to all attendees.

### Check free/busy

```bash
python3 ~/.config/calendar/gcal.py --account inematds freebusy --date 2026-05-20
python3 ~/.config/calendar/gcal.py --account inematds freebusy --date 2026-05-20 --days 3
```

### Authenticate an account

```bash
python3 ~/.config/calendar/gcal.py --account inematds auth
python3 ~/.config/calendar/gcal.py --account nei2014 auth
python3 ~/.config/calendar/gcal.py --account nei2024 auth
```

Browser opens for each account. Each saves its own token (`~/.config/calendar/token_ALIAS.json`). All three share the same `credentials.json` OAuth client.

## CRITICAL: Day-of-Week Verification

**Never assume a date from a day name.** Always verify before creating:

```bash
python3 -c "from datetime import date; d = date(2026, 5, 20); print(d.strftime('%A %Y-%m-%d'))"
```

If output doesn't match what was requested, find the correct date. Wrong day = wrong invite to real people.

## Workflow

1. If no time given, check `list --days 7` first
2. If a day name was mentioned, verify the date
3. Check `freebusy` for the slot
4. Show user what will be created (title, day+date, time, duration, attendees, Meet, account)
5. Create only after confirmation

## Confirmation Before Creating

Always show before executing:
- Account (which email)
- Title
- Day of week + Date/time (e.g. "Quarta-feira, 20/05/2026 às 14h")
- Duration
- Attendees
- Meet: yes/no

## Timezone

`America/Sao_Paulo` — set in the `TIMEZONE` constant in `gcal.py`.

## Defaults

- Duration: 60 minutes
- Always add `--meet` unless user says no video
- Invites sent to all attendees automatically

## One-Time Setup

Requires `~/.config/gmail/credentials.json` (Google OAuth 2.0 Desktop Client). Same file used by Gmail skill.

Authenticate each account once:

```bash
python3 ~/.config/calendar/gcal.py --account inematds auth
python3 ~/.config/calendar/gcal.py --account nei2014 auth
python3 ~/.config/calendar/gcal.py --account nei2024 auth
```

Tokens saved to:
- `~/.config/calendar/token_inematds.json`
- `~/.config/calendar/token_nei2014.json`
- `~/.config/calendar/token_nei2024.json`

## Error Handling

- `credentials.json` missing → point to Gmail skill setup (same file)
- `token_ALIAS.json` missing → run `auth` for that account
- Event creation fails → show error, ask what to do
