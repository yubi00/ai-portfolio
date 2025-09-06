import os
import uuid
import json
import requests
from typing import Dict, List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

app = FastAPI(title="AI Portfolio Backend - Vercel")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://yubi-github-mcp-server.onrender.com/mcp")

# Session management
SESSIONS: Dict[str, Dict] = {}

def send_mcp_request(method: str, params: dict = None) -> dict:
    """Send a request to MCP server"""
    payload = {
        "jsonrpc": "2.0",
        "method": method,
        "params": params or {},
        "id": str(uuid.uuid4())
    }
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    
    try:
        response = requests.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Handle SSE format
        if response.text.startswith("event:"):
            lines = [line for line in response.text.splitlines() if line.startswith("data:")]
            if lines:
                data = json.loads(lines[0][len("data:"):].strip())
            else:
                return {"error": "No data in SSE response"}
        else:
            data = response.json()
            
        return data
        
    except Exception as e:
        return {"error": f"MCP request failed: {str(e)}"}

@app.get("/")
def root():
    return {
        "status": "AI Portfolio Backend - Vercel",
        "version": "1.0.0",
        "mcp_server": MCP_SERVER_URL
    }

@app.post("/prompt")
def handle_prompt(payload: dict):
    """Handle prompt requests"""
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", str(uuid.uuid4())[:8])
    
    if not prompt:
        return {"error": "No prompt provided"}
    
    # Initialize session if needed
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"history": [], "last_response": ""}
    
    session = SESSIONS[session_id]
    
    try:
        # Test MCP server connection
        mcp_response = send_mcp_request("tools/list")
        
        if "error" in mcp_response:
            reply = f"I encountered an issue connecting to the MCP server: {mcp_response['error']}"
        else:
            reply = f"Hello! I received your message: '{prompt}'. I'm successfully connected to the MCP server and can help you with questions about Yubi's portfolio!"
        
        # Update session
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "vercel_fastapi"
        }
        
    except Exception as e:
        return {
            "reply": f"Error processing request: {str(e)}",
            "session_id": session_id,
            "source": "error"
        }
