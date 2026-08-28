# ai-api (skeleton)

FastAPI 서비스 골격. **T1-0 범위 = 부팅 확인까지** — 기능 코드는 없다.

```powershell
cd services/ai-api
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# 확인: http://localhost:8000/health
```
