# ✨ Unified MCP Client - Works Locally AND on Vercel
"""
Unified MCP client that works both locally (uvicorn) and on Vercel serverless.
Includes all features: MCP initialization, session management, context resolution,
prompt classification, tool routing, and response summarization.
"""
import os
import uuid
import json
import requests
import re
from typing import Dict, List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Try to import dotenv for local development (optional)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    # dotenv not available (e.g., in Vercel), skip loading
    pass

app = FastAPI(title="AI Portfolio MCP Client - Unified")

# Configure CORS for production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "https://yubi-github-mcp-server.onrender.com/mcp")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Session management
SESSIONS: Dict[str, Dict] = {}

# MCP Connection state
MCP_INITIALIZED = False
MCP_SESSION_ID = None
MCP_CAPABILITIES = {}

def initialize_mcp_connection() -> bool:
    """
    Proper MCP initialization sequence:
    1. Send initialize request 
    2. Receive capabilities and protocol version
    3. Send initialized notification
    """
    global MCP_INITIALIZED, MCP_SESSION_ID, MCP_CAPABILITIES
    
    if MCP_INITIALIZED:
        return True
        
    try:
        print("🔗 Initializing MCP connection...")
        
        # Step 1: Send initialize request
        init_payload = {
            "jsonrpc": "2.0",
            "method": "initialize", 
            "id": str(uuid.uuid4()),
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "roots": {"listChanged": True},
                    "sampling": {},
                    "elicitation": {}
                },
                "clientInfo": {
                    "name": "yubi-portfolio-client-vercel",
                    "version": "1.0.0"
                }
            }
        }
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        
        print(f"📤 Sending initialize request to {MCP_SERVER_URL}")
        response = requests.post(MCP_SERVER_URL, json=init_payload, headers=headers, timeout=30)
        
        if not response.ok:
            print(f"❌ MCP initialize failed: HTTP {response.status_code}")
            return False
            
        # Parse response (handle SSE format)
        if response.text.startswith("event:"):
            lines = [line for line in response.text.splitlines() if line.startswith("data:")]
            if lines:
                data = json.loads(lines[0][len("data:"):].strip())
            else:
                print("❌ No data in SSE response")
                return False
        else:
            data = response.json()
            
        # Check for errors
        if "error" in data:
            print(f"❌ MCP server error: {data['error']}")
            return False
            
        # Extract server info and capabilities
        result = data.get("result", {})
        MCP_CAPABILITIES = result.get("capabilities", {})
        
        # Check for session ID in headers
        if hasattr(response, 'headers') and 'Mcp-Session-Id' in response.headers:
            MCP_SESSION_ID = response.headers['Mcp-Session-Id']
            
        print(f"✅ MCP initialized successfully")
        
        # Step 2: Send initialized notification
        initialized_payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        
        if MCP_SESSION_ID:
            headers["Mcp-Session-Id"] = MCP_SESSION_ID
            
        init_response = requests.post(MCP_SERVER_URL, json=initialized_payload, headers=headers, timeout=10)
        
        if init_response.ok:
            print("✅ MCP initialization complete")
            MCP_INITIALIZED = True
            return True
        else:
            print(f"⚠️  Initialized notification failed but continuing...")
            MCP_INITIALIZED = True
            return True
            
    except Exception as e:
        print(f"❌ MCP initialization failed: {str(e)}")
        return False

def send_mcp_request(method: str, params: dict = None) -> dict:
    """Send a request to MCP server with proper headers and session management"""
    if not MCP_INITIALIZED:
        if not initialize_mcp_connection():
            return {"error": "Failed to initialize MCP connection"}
    
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
    
    if MCP_SESSION_ID:
        headers["Mcp-Session-Id"] = MCP_SESSION_ID
    
    try:
        response = requests.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=120)
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

def classify_prompt(prompt: str) -> bool:
    """Classify if prompt is relevant to Yubi's portfolio using OpenAI"""
    if not prompt.strip() or not OPENAI_API_KEY:
        return True  # Default to relevant if no API key
    
    system_prompt = (
        "You are a strict classifier. Reply with 'relevant' if the user prompt is about Yubi's personal projects, skills, experiences, or technical work. "
        "Reply with 'irrelevant' ONLY if clearly about unrelated topics. When in doubt, classify as 'relevant'. "
        "Only reply with 'relevant' or 'irrelevant'."
    )
    
    try:
        # Simple OpenAI API call (using requests since we don't have openai client)
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 16,
                "temperature": 0.0
            },
            timeout=10
        )
        
        if response.ok:
            data = response.json()
            label = data["choices"][0]["message"]["content"].strip().lower()
            is_relevant = label == "relevant"
            print(f"🔍 Classification: '{prompt[:30]}...' → {label.upper()}")
            return is_relevant
        else:
            print(f"⚠️  Classification API failed - defaulting to relevant")
            return True
            
    except Exception as e:
        print(f"⚠️  Classification failed: {e} - defaulting to relevant")
        return True

def chat_response(prompt: str) -> str:
    """Generate response for irrelevant prompts"""
    if not OPENAI_API_KEY:
        return "I'd love to help, however I'm primarily focused on Yubi's projects, skills, and experiences! What would you like to know about the technical work?"
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system", 
                        "content": "You are Yubi's AI portfolio assistant. Politely decline non-technical questions and redirect to Yubi's projects and skills."
                    },
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 200,
                "temperature": 0.7
            },
            timeout=10
        )
        
        if response.ok:
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        else:
            return "I'd love to help, however I'm primarily focused on Yubi's projects, skills, and experiences! What would you like to know about the technical work?"
            
    except Exception as e:
        return "I'd love to help, however I'm primarily focused on Yubi's projects, skills, and experiences! What would you like to know about the technical work?"

def smart_context_resolver(prompt: str, session_id: str) -> str:
    """Enhanced context resolution using session history"""
    if session_id not in SESSIONS or not SESSIONS[session_id].get("last_response"):
        return prompt
    
    prompt_lower = prompt.lower()
    context_words = ["first", "second", "third", "1st", "2nd", "3rd", "the first", "the second", 
                    "first one", "second one", "that one", "this one", "it", "that", "this project"]
    
    has_context_reference = any(word in prompt_lower for word in context_words)
    if not has_context_reference or not OPENAI_API_KEY:
        return prompt
    
    last_response = SESSIONS[session_id]["last_response"]
    
    try:
        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{
                    "role": "user", 
                    "content": f"""CONTEXT RESOLVER: The user is referring to something from my previous response.
                    
Previous response: "{last_response}"
Current user question: "{prompt}"

If the user is referring to a specific project, rewrite their question to be explicit using JUST the project name.
Only return the rewritten question, nothing else:"""
                }],
                "max_tokens": 100,
                "temperature": 0.1
            },
            timeout=10
        )
        
        if response.ok:
            data = response.json()
            resolved = data["choices"][0]["message"]["content"].strip()
            if resolved and resolved != prompt:
                print(f"🔍 Context resolved: '{prompt}' → '{resolved}'")
                return resolved
                
    except Exception as e:
        print(f"Context resolution failed: {e}")
    
    return prompt

def extract_project_name(prompt: str) -> str:
    """Extract project name from prompt"""
    prompt_lower = prompt.lower()
    
    # Remove markdown links and URLs
    cleaned_prompt = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', prompt)
    cleaned_prompt = re.sub(r'https?://[^\s]+', '', cleaned_prompt)
    
    # Common patterns for project mentions
    patterns = [
        (r"about\s+([a-zA-Z0-9-_]+)", 1),
        (r"([a-zA-Z0-9-_]+)\s+project", 0),
        (r"describe\s+([a-zA-Z0-9-_]+)", 1),
        (r"what\s+is\s+([a-zA-Z0-9-_]+)", 2),
    ]
    
    for pattern, group_idx in patterns:
        match = re.search(pattern, cleaned_prompt.lower())
        if match:
            project_name = match.group(1)
            if project_name.lower() not in ['the', 'a', 'an', 'my', 'your', 'this', 'that', 'it']:
                return project_name
    
    # Fallback: look for project-like names
    words = cleaned_prompt.split()
    for word in words:
        clean_word = word.strip('.,?!').replace('"', '').replace("'", '')
        if ('-' in clean_word or any(c.isupper() for c in clean_word)) and len(clean_word) > 3:
            if clean_word.lower() not in ['what', 'tell', 'about', 'describe', 'project', 'github', 'com']:
                return clean_word
    
    return None

def determine_tool_with_context(prompt: str, tools: List[dict], context: dict) -> tuple:
    """Determine which MCP tool to use based on prompt and context"""
    portfolio_owner = context.get("portfolio_owner", "yubi00")
    prompt_lower = prompt.lower()
    
    if any(word in prompt_lower for word in ['list', 'projects', 'repositories', 'what are', 'skills']):
        return ("list_repositories", {
            "type": "owner",
            "sort": "updated", 
            "direction": "desc",
            "per_page": 30
        })
    
    elif any(word in prompt_lower for word in ['tell me about', 'describe', 'what is']):
        project_name = extract_project_name(prompt)
        
        if project_name:
            repo_name = project_name.lower().replace('_', '-')
            return ("get_repository", {
                "owner": portfolio_owner,
                "repo": repo_name
            })
        else:
            return ("list_repositories", {
                "type": "owner",
                "sort": "updated", 
                "direction": "desc"
            })
    
    elif any(word in prompt_lower for word in ['code', 'files', 'structure', 'contents']):
        project_name = extract_project_name(prompt) or "ai-portfolio"
        return ("get_repository_contents", {
            "owner": portfolio_owner,
            "repo": project_name,
            "path": ""
        })
    
    elif any(word in prompt_lower for word in ['search', 'find', 'has', 'using']):
        search_term = prompt.lower().replace('search', '').replace('find', '').replace('has', '').replace('using', '').strip()
        return ("search_repositories", {
            "q": f"user:{portfolio_owner} {search_term}",
            "sort": "updated",
            "order": "desc"
        })
    
    else:
        return ("list_repositories", {
            "type": "owner",
            "sort": "updated",
            "direction": "desc"
        })

def process_prompt_with_mcp(prompt: str, session_id: str) -> dict:
    """Process prompt using MCP server with proper routing"""
    tools_response = send_mcp_request("tools/list")
    if "error" in tools_response:
        return tools_response
    
    tools = tools_response.get("result", {}).get("tools", [])
    if not tools:
        return {"error": "No tools available from MCP server"}
    
    portfolio_context = {
        "portfolio_owner": "yubi00",
        "session_id": session_id,
        "prompt": prompt
    }
    
    tool_call = determine_tool_with_context(prompt, tools, portfolio_context)
    
    if not tool_call:
        return {"error": "Could not determine appropriate action for prompt"}
    
    tool_name, tool_args = tool_call
    
    print(f"🔧 MCP Server routing: {tool_name} with args: {tool_args}")
    tool_response = send_mcp_request("tools/call", {
        "name": tool_name,
        "arguments": tool_args
    })
    
    if "error" in tool_response:
        return tool_response
        
    tool_response["_tool_used"] = tool_name
    tool_response["_tool_args"] = tool_args
    
    return tool_response

def summarize_mcp_response(mcp_response: dict, original_prompt: str, session_context: Dict = None) -> str:
    """Summarize MCP response using OpenAI"""
    if not OPENAI_API_KEY:
        return f"Here's what I found: {str(mcp_response)[:300]}..."
    
    try:
        conversation_context = ""
        if session_context and session_context.get("history"):
            recent = session_context["history"][-2:]
            conversation_context = "\n".join([
                f"Previous - User: {msg['user']}\nPrevious - Assistant: {msg['assistant']}" 
                for msg in recent
            ])
        
        context_prompt = f"""You are Yubi's GitHub portfolio assistant. Provide a friendly, conversational response.

{"Previous conversation:\n" + conversation_context + "\n" if conversation_context else ""}
Current question: "{original_prompt}"
Technical data: {mcp_response}

Give a natural, helpful response that builds on our conversation."""

        response = requests.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "gpt-4o-mini",
                "messages": [{"role": "user", "content": context_prompt}],
                "max_tokens": 400,
                "temperature": 0.3
            },
            timeout=15
        )
        
        if response.ok:
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
        else:
            return f"Here's what I found: {str(mcp_response)[:300]}..."
            
    except Exception as e:
        return f"Here's what I found: {str(mcp_response)[:300]}..."

@app.get("/")
def root():
    return {
        "status": "✨ Complete MCP Client - Vercel Serverless",
        "version": "1.0.0",
        "environment": "vercel",
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "mcp_server_url": os.getenv("MCP_SERVER_URL", "not_set")
    }

@app.get("/sessions/{session_id}")
def get_session(session_id: str):
    """Get session history and context"""
    if session_id not in SESSIONS:
        return {"error": "Session not found"}
    
    session = SESSIONS[session_id]
    return {
        "session_id": session_id,
        "message_count": len(session.get("history", [])),
        "last_response": session.get("last_response", ""),
        "history": session.get("history", [])[-10:]
    }

class PromptRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None

@app.post("/prompt")
def handle_prompt(payload: PromptRequest):
    """Complete MCP architecture with all features"""
    prompt = payload.prompt
    session_id = payload.session_id or str(uuid.uuid4())[:8]
    
    print(f"🔍 Processing: prompt='{prompt}', session_id='{session_id}'")
    
    if not prompt:
        return {"error": "No prompt provided"}
    
    # Initialize/get session
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"history": [], "last_response": ""}
    
    session = SESSIONS[session_id]
    
    # 1. Resolve contextual references
    resolved_prompt = smart_context_resolver(prompt, session_id)
    if resolved_prompt != prompt:
        print(f"📝 Context resolution: '{prompt}' → '{resolved_prompt}'")
    
    # 2. Check relevancy
    is_relevant = classify_prompt(resolved_prompt)
    print(f"🎯 Classification: '{resolved_prompt}' → {'RELEVANT' if is_relevant else 'IRRELEVANT'}")
    if not is_relevant:
        reply = chat_response(prompt)
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "friendly_chat",
            "resolved": resolved_prompt if resolved_prompt != prompt else None
        }
    
    # 3. Process with MCP server
    mcp_response = process_prompt_with_mcp(resolved_prompt, session_id)
    
    # 4. Handle errors
    if "error" in mcp_response:
        reply = f"I encountered an issue accessing the portfolio data: {mcp_response['error']}"
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "mcp_error",
            "resolved": resolved_prompt if resolved_prompt != prompt else None
        }
    
    # 5. Summarize MCP response with context
    summary = summarize_mcp_response(mcp_response, resolved_prompt, session)
    
    # 6. Update session
    session["history"].append({"user": prompt, "assistant": summary})
    session["last_response"] = summary
    
    return {
        "reply": summary,
        "session_id": session_id,
        "tool_used": mcp_response.get("_tool_used", "unknown"),
        "tool_args": mcp_response.get("_tool_args", {}),
        "source": "mcp_server",
        "resolved": resolved_prompt if resolved_prompt != prompt else None,
        "mcp_initialized": MCP_INITIALIZED
    }

@app.get("/mcp/status")
def mcp_status():
    """Get MCP connection status and capabilities"""
    global MCP_INITIALIZED, MCP_SESSION_ID, MCP_CAPABILITIES
    
    if not MCP_INITIALIZED:
        print("🔄 Auto-initializing MCP connection for status check...")
        MCP_INITIALIZED = initialize_mcp_connection()
    
    return {
        "initialized": MCP_INITIALIZED,
        "session_id": MCP_SESSION_ID,
        "capabilities": MCP_CAPABILITIES,
        "server_url": MCP_SERVER_URL,
        "connection_status": "connected" if MCP_INITIALIZED else "disconnected"
    }

@app.post("/mcp/reinitialize") 
def reinitialize_mcp():
    """Force MCP reinitialization"""
    global MCP_INITIALIZED, MCP_SESSION_ID, MCP_CAPABILITIES
    
    MCP_INITIALIZED = False
    MCP_SESSION_ID = None
    MCP_CAPABILITIES = {}
    
    success = initialize_mcp_connection()
    return {
        "success": success,
        "initialized": MCP_INITIALIZED,
        "session_id": MCP_SESSION_ID
    }

# Export for Vercel
handler = app

# Local development server (only runs when executed directly)
if __name__ == "__main__":
    try:
        import uvicorn
        
        print("🚀 Starting Unified MCP Client...")
        print("✨ Architecture: Client → MCP Server (handles routing) → Tools")
        print("🔧 Features: Full MCP initialization | Server-side routing | Session management")
        print("📋 Initialization sequence: initialize → capabilities exchange → initialized notification")
        
        # Initialize MCP connection on startup
        if initialize_mcp_connection():
            print("🎯 MCP ready - starting HTTP server...")
        else:
            print("⚠️  MCP initialization failed - server will attempt reconnection on first request")
        
        port = int(os.getenv("PORT", 9000))
        uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
        
    except ImportError:
        print("❌ uvicorn not available - this file is configured for Vercel serverless deployment")
        print("💡 To run locally: pip install uvicorn python-dotenv")
        print("🚀 For Vercel: This file exports 'handler' for serverless functions")
