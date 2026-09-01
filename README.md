# Nyx

Nyx is a self-hosted AI workspace powered by Ollama. It provides streaming chat, projects, documents, file context, model and node management, search, themes, and administration in one local web interface.

## Requirements

- Debian or Ubuntu server for the installer
- An Ollama instance reachable from the server
- `sudo` access

The installer provisions Python, Node.js, nginx, the FastAPI backend, and the frontend automatically.

## Install

Clone this repository on the server, then run:

```bash
sudo bash ./install.sh
```

The application is installed with these defaults:

| Component | Default |
| --- | --- |
| Backend service | `nyx-backend` |
| Backend port | `8000` on `127.0.0.1` |
| Frontend files | `/var/www/nyx` |
| Web server | nginx on port `80` |

For a domain name, provide it during installation:

```bash
sudo NYX_DOMAIN=nyx.example.com bash ./install.sh
```

Open `http://<server-ip>/` or your configured domain, then create the first account. The first account is automatically approved as an administrator.

## Configuration

The installer accepts environment-variable overrides:

```bash
sudo NYX_DOMAIN=nyx.example.com \
  NYX_PORT=8000 \
  NYX_APP_DIR=/opt/nyx \
  NYX_WEB_ROOT=/var/www/nyx \
  bash ./install.sh
```

Set `NYX_API_URL` only when the frontend must call an API on another host. With the default nginx proxy, leave it empty so the browser uses same-origin `/api` requests.

After deployment, the frontend runtime configuration is available at:

```text
/var/www/nyx/config.js
```

You can update `API_URL` there without rebuilding the frontend.

## Ollama Nodes

Sign in as an administrator, open **Nodes**, and add the Ollama URL, for example:

```text
http://192.168.1.138:11434
```

Nyx probes configured nodes and supports priority-based failover. Select a model in a chat before sending a message.

## Local Development

Install frontend dependencies and start Vite:

```bash
npm ci
npm run dev
```

In a second terminal, start the backend:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

For Windows PowerShell, activate the virtual environment with:

```powershell
.\.venv\Scripts\Activate.ps1
```

## Operations

```bash
sudo systemctl status nyx-backend
sudo systemctl restart nyx-backend
sudo journalctl -u nyx-backend -f
sudo nginx -t
sudo systemctl reload nginx
```

## Build

Create a production frontend bundle with:

```bash
npm run build
```

The installer runs this build automatically.

## License

No license has been specified for this repository.