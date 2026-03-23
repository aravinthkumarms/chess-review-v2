@echo off
cd /d "%~dp0"

echo Starting Docker Compose...
docker compose up -d

echo Starting Video Service...
start "Video Service" cmd /k "cd video-service && npm install && npm start"

echo Starting Next.js Frontend...
start "Next.js Frontend" cmd /k "npm run dev"

echo Starting Python Backend...
start "Python Backend" cmd /k "call .venv\Scripts\activate.bat && npm run dev:python"

echo Initialization complete! You should see three new terminal windows open.
