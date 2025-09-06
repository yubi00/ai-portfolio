import os
import sys
import uuid
import json
import requests
from typing import Dict, List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI(title="AI Portfolio Backend - Vercel Serverless")

# Configure CORS for Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Vercel handles CORS differently
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://yubi-github-mcp-server.onrender.com/mcp")

# Session management
SESSIONS: Dict[str, Dict] = {}

# Import the core functions from mcp-client
try:
    from mcp_client.main import (
        initialize_mcp_connection,
        send_mcp_request,
        classify_prompt,
        chat_response,
        smart_context_resolver,
        process_prompt_with_mcp,
        summarize_mcp_response
    )
except ImportError:
    # Fallback - copy the essential functions here if import fails
    print("Could not import from mcp-client, using fallback functions")

@app.get("/")
def root():
    return {
        "status": "AI Portfolio Backend - Vercel Serverless",
        "version": "1.0.0",
        "platform": "vercel"
    }

@app.post("/prompt")
def handle_prompt(payload: dict):
    """Handle prompt requests - simplified for serverless"""
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", str(uuid.uuid4())[:8])
    
    if not prompt:
        return {"error": "No prompt provided"}
    
    # Initialize session if needed
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"history": [], "last_response": ""}
    
    session = SESSIONS[session_id]
    
    try:
        # For serverless, we'll use a simplified approach
        # Direct MCP server communication
        mcp_response = send_mcp_request("tools/list")
        
        if "error" in mcp_response:
            reply = f"I encountered an issue: {mcp_response['error']}"
        else:
            reply = f"Connected to MCP server successfully. Your prompt: {prompt}"
        
        # Update session
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "vercel_serverless"
        }
        
    except Exception as e:
        return {
            "reply": f"Error processing request: {str(e)}",
            "session_id": session_id,
            "source": "error"
        }

# Export the app for Vercel
handler = app
