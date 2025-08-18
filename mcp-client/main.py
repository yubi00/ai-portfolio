from openai import OpenAI
import os
import uuid
import requests
from fastapi import FastAPI, Body, HTTPException
from fastapi.concurrency import run_in_threadpool
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

def summarize(prompt: str) -> str:
    if not prompt.strip():
        return "Please ask about Yubi's personal projects, skills, or GitHub tools."
    # Guardrails: instruct LLM to only answer about Yubi's projects/skills
    system_prompt = (
        "You are Yubi's AI portfolio assistant. You should answer questions about Yubi's personal projects, skills, or any GitHub projects or repositories . "
        "If the user greets you (e.g., says hello, hi, how are you), respond warmly and introduce yourself as Yubi's assistant. "
        "If the user asks about anything unrelated (like weather, news, etc.), kindly reply: 'Sorry, I can only answer questions about Yubi's projects, skills, or experiences.'"
    )
    response = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        max_output_tokens=256,
        temperature=0.2,
    )
    print("OpenAI response:", response.output_text.strip())  # Debug print
    return response.output_text.strip()


def _rpc(payload: dict, timeout: int = 60) -> dict:
    """Send a JSON-RPC call to the MCP server (HTTP)."""
    payload.setdefault("jsonrpc", "2.0")
    payload.setdefault("id", str(uuid.uuid4()))
    r = _session.post(MCP_SERVER_URL, json=payload, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    print("Raw HTTP data from MCP server:", data)  # Debug print
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
        # Passthrough full JSON-RPC if provided (already a valid MCP call)
        if "method" in payload:
            print("Received JSON-RPC method:", payload["method"])
            _ensure_initialized()
            return _rpc(payload)

        # Direct tool call shape
        if "name" in payload:
            print("Received tool name:", payload["name"])
            _ensure_initialized()
            return _rpc({
                "method": "tools/call",
                "params": {
                    "name": payload["name"],
                    "arguments": payload.get("arguments", {}),
                },
            })

        # Free-text prompt: call OpenAI if present, else reply kindly
        if "prompt" in payload:
            prompt = payload["prompt"]
            print("Received prompt:", prompt)
            return {"result": summarize(prompt)}

        # No valid input
        return {"result": "Please enter a prompt or use a supported tool."}

    return await run_in_threadpool(send_request)


if __name__ == "__main__":
    # Run with: python3 main.py
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)
