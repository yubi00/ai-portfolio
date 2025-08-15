# main.py
import os
import uuid
import requests
from fastapi import FastAPI, Body, HTTPException
from fastapi.concurrency import run_in_threadpool
import uvicorn

app = FastAPI()

# Point this at the HTTP endpoint your MCP server actually handles.
# You said /mcp works for you.
MCP_SERVER_URL = os.getenv("MCP_URL", "http://127.0.0.1:8000/mcp")

# Reuse a session and set the headers your server expects
_session = requests.Session()
_session.headers.update({
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
})

_initialized = False


def _rpc(payload: dict, timeout: int = 60) -> dict:
    """Send a JSON-RPC call to the MCP server."""
    payload.setdefault("jsonrpc", "2.0")
    payload.setdefault("id", str(uuid.uuid4()))
    r = _session.post(MCP_SERVER_URL, json=payload, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])
    return data


def _ensure_initialized():
    global _initialized
    if _initialized:
        return
    _rpc({
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "backend-bridge", "version": "0.1.0"},
        },
    })
    _initialized = True


@app.get("/")
def root():
    return {"ok": True, "message": "Bridge running. POST /prompt to call tools."}


@app.post("/prompt")
async def handle_prompt(payload: dict = Body(...)):
    """
    Accepts one of:
      1) {"name":"<toolName>", "arguments":{...}}  -> calls tools/call
      2) {"method":"tools/call"|"tools/list"|..., "params":{...}} -> passthrough JSON-RPC
      3) {"prompt":"..."} -> 400 (no routing implemented here)
    """
    def send_request():
        _ensure_initialized()

        # Passthrough full JSON-RPC if provided (already a valid MCP call)
        if "method" in payload:
            return _rpc(payload)

        # Direct tool call shape
        if "name" in payload:
            return _rpc({
                "method": "tools/call",
                "params": {
                    "name": payload["name"],
                    "arguments": payload.get("arguments", {}),
                },
            })

        # Only free-text provided -> tell caller to specify a tool (or add your own router/LLM)
        if "prompt" in payload:
            raise HTTPException(
                status_code=400,
                detail="Provide {'name': '<toolName>', 'arguments': {...}} or a JSON-RPC {'method','params'} body."
            )

        raise HTTPException(status_code=400, detail="Invalid body.")

    return await run_in_threadpool(send_request)


if __name__ == "__main__":
    # Run with: python3 main.py
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)
