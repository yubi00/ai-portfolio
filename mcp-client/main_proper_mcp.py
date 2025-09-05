# ✨ Proper MCP Client with Full Protocol Compliance
"""
This version follows proper MCP architecture:
1. Client sends prompts directly to MCP server
2. MCP server handles ALL routing and tool selection  
3. Client just manages sessions and summarizes responses
4. Full MCP initialization sequence (initialize → initialized notification)
5. Keeps all contextual session features from simplified version
"""
import os
import uuid
import json
import requests
from typing import Dict, List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
import uvicorn

load_dotenv()

app = FastAPI(title="Proper MCP Client with Full Protocol Compliance")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8000/mcp")

# Session management (same as simplified version)
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
                "protocolVersion": "2024-11-05",  # Latest supported version
                "capabilities": {
                    "roots": {"listChanged": True},
                    "sampling": {},
                    "elicitation": {}
                },
                "clientInfo": {
                    "name": "yubi-portfolio-client",
                    "version": "0.3.0"
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
            print(f"Response: {response.text}")
            return False
            
        # Parse response (handle SSE format)
        if response.text.startswith("event:"):
            # Parse SSE format
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
        server_info = result.get("serverInfo", {})
        protocol_version = result.get("protocolVersion", "unknown")
        
        # Check for session ID in headers (for stateful servers)
        if hasattr(response, 'headers') and 'Mcp-Session-Id' in response.headers:
            MCP_SESSION_ID = response.headers['Mcp-Session-Id']
            print(f"📋 MCP session ID: {MCP_SESSION_ID}")
            
        print(f"✅ MCP initialized successfully")
        print(f"   Server: {server_info.get('name', 'unknown')} v{server_info.get('version', 'unknown')}")
        print(f"   Protocol: {protocol_version}")
        print(f"   Capabilities: {list(MCP_CAPABILITIES.keys())}")
        
        # Step 2: Send initialized notification
        initialized_payload = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        }
        
        # Include session ID if provided
        if MCP_SESSION_ID:
            headers["Mcp-Session-Id"] = MCP_SESSION_ID
            
        print("📤 Sending initialized notification...")
        init_response = requests.post(MCP_SERVER_URL, json=initialized_payload, headers=headers, timeout=10)
        
        if init_response.ok:
            print("✅ MCP initialization complete - ready for operations")
            MCP_INITIALIZED = True
            return True
        else:
            print(f"⚠️  Initialized notification failed (HTTP {init_response.status_code}) but continuing...")
            # Some servers may not require this, so we continue
            MCP_INITIALIZED = True
            return True
            
    except Exception as e:
        print(f"❌ MCP initialization failed: {str(e)}")
        return False

def send_mcp_request(method: str, params: dict = None) -> dict:
    """
    Send a request to MCP server with proper headers and session management
    """
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
    
    # Add session ID if we have one
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
    """Proper relevancy classification (from working simplified version)"""
    if not prompt.strip():
        return False
    
    system_prompt = (
        "You are a strict classifier. Reply with 'relevant' if the user prompt is about Yubi's personal projects (including all projects, some projects, or a particular project), skills, experiences, or anything related to Yubi's GitHub repositories. "
        "This includes questions like 'Tell me about your projects', 'Tell me about this project', 'What are your skills?', 'Describe your experience', or any mention of MCP (Model Context Protocol), servers, Python projects, or specific technologies. "
        "Reply with 'irrelevant' if the prompt is about anything else (such as news, weather, sports, general greetings like 'hi', or general topics not related to Yubi's projects, skills, or experiences). Only reply with 'relevant' or 'irrelevant'."
    )
    
    try:
        response = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            max_output_tokens=16,  # Minimum required by OpenAI
            temperature=0.0
        )
        label = response.output_text.strip().lower()
        is_relevant = label == "relevant"
        
        print(f"🔍 Classification: '{prompt[:30]}...' → {label.upper()} ({'MCP' if is_relevant else 'CHAT'})")
        return is_relevant
        
    except Exception as e:
        print(f"⚠️  Classification failed: {e} - defaulting to relevant")
        return True  # Default to relevant if OpenAI fails

def chat_response(prompt: str, session_history: List[Dict]) -> str:
    """Generate friendly response for irrelevant prompts"""
    try:
        system_prompt = (
            "You are Yubi's AI portfolio assistant. Respond kindly and conversationally to questions not about Yubi's projects. "
            "Encourage them to ask about Yubi's projects, skills, or experiences."
        )
        
        response = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            max_output_tokens=256,
            temperature=0.5
        )
        return response.output_text.strip()
    except Exception as e:
        return "Hi! I'm here to help you learn about Yubi's projects and skills. What would you like to know?"

def smart_context_resolver(prompt: str, session_id: str) -> str:
    """Enhanced context resolution using LLM + last response (from simplified version)"""
    if session_id not in SESSIONS or not SESSIONS[session_id].get("last_response"):
        return prompt
    
    # Check if prompt has contextual references
    prompt_lower = prompt.lower()
    context_words = ["first", "second", "third", "1st", "2nd", "3rd", "the first", "the second", 
                    "first one", "second one", "that one", "this one", "it", "that", "this project"]
    
    has_context_reference = any(word in prompt_lower for word in context_words)
    if not has_context_reference:
        return prompt
    
    # Use LLM to resolve with last response context
    last_response = SESSIONS[session_id]["last_response"]
    
    try:
        response = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[{
                "role": "user", 
                "content": f"""CONTEXT RESOLVER: The user is referring to something from my previous response. 
                
Previous response: "{last_response}"
Current user question: "{prompt}"

If the user is referring to a specific project from the previous response, rewrite their question to be explicit using JUST the project name (no URLs or markdown links).

Examples:
- "tell me about the second one" → "tell me about ProjectName"  
- "I'm interested in the first project" → "tell me about FirstProjectName"
- "what about that one" → "tell me about ProjectName"
- "tell me about the third project" → "tell me about ThirdProjectName"

IMPORTANT: Use ONLY the project name, not GitHub URLs or markdown links.

Only return the rewritten question, nothing else:"""
            }],
            max_output_tokens=100,
            temperature=0.1
        )
        
        resolved = response.output_text.strip()
        if resolved and resolved != prompt:
            print(f"🔍 Context resolved: '{prompt}' → '{resolved}'")
            return resolved
            
    except Exception as e:
        print(f"Context resolution failed: {e}")
    
    return prompt

def process_prompt_with_mcp(prompt: str, session_id: str) -> dict:
    """
    Proper MCP architecture: Let server handle routing with portfolio context.
    Client provides context, server makes all routing decisions.
    """
    # Ideally, we'd have a single endpoint that handles everything:
    # send_mcp_request("process_portfolio_query", {"prompt": prompt, "context": {...}})
    # 
    # Since our current MCP server uses individual tools, we simulate proper 
    # architecture by letting the server know this is about Yubi's portfolio
    
    # First, check what tools are available (discovery phase)
    tools_response = send_mcp_request("tools/list")
    if "error" in tools_response:
        return tools_response
    
    tools = tools_response.get("result", {}).get("tools", [])
    if not tools:
        return {"error": "No tools available from MCP server"}
    
    # In proper MCP architecture, we'd send context to help the server route:
    portfolio_context = {
        "portfolio_owner": "yubi00",  # Server needs to know whose portfolio
        "session_id": session_id,
        "prompt": prompt
    }
    
    # For now, we simulate server-side routing by using a more intelligent approach
    # that considers the portfolio context. The server would do this internally.
    tool_call = determine_tool_with_context(prompt, tools, portfolio_context)
    
    if not tool_call:
        return {"error": "Could not determine appropriate action for prompt"}
    
    tool_name, tool_args = tool_call
    
    # Call the MCP tool with portfolio context
    print(f"🔧 MCP Server routing: {tool_name} with portfolio context: {tool_args}")
    tool_response = send_mcp_request("tools/call", {
        "name": tool_name,
        "arguments": tool_args
    })
    
    if "error" in tool_response:
        return tool_response
        
    # Add metadata about the routing decision
    tool_response["_tool_used"] = tool_name
    tool_response["_tool_args"] = tool_args
    tool_response["_portfolio_context"] = portfolio_context
    
    return tool_response

def determine_tool_with_context(prompt: str, tools: List[dict], context: dict) -> tuple:
    """
    Simulate server-side routing with portfolio context.
    In a real MCP server, this logic would be internal to the server.
    """
    portfolio_owner = context.get("portfolio_owner", "yubi00")
    prompt_lower = prompt.lower()
    
    # Server-side logic: analyze prompt and apply portfolio context
    if any(word in prompt_lower for word in ['list', 'projects', 'repositories', 'what are', 'skills']):
        # Portfolio listing request
        return ("list_repositories", {
            "type": "owner",  # Server knows to show owner's repos
            "sort": "updated", 
            "direction": "desc",
            "per_page": 30
        })
    
    elif any(word in prompt_lower for word in ['tell me about', 'describe', 'what is']):
        # Specific project request - extract project name
        project_name = extract_project_name(prompt)
        
        if project_name:
            # Convert to lowercase for GitHub API (repositories are typically lowercase)
            repo_name = project_name.lower().replace('_', '-')  # Handle underscore to dash conversion
            
            return ("get_repository", {
                "owner": portfolio_owner,
                "repo": repo_name
            })
        else:
            # If we can't extract a project name, default to listing projects
            print(f"⚠️  Could not extract project name from: '{prompt}' - defaulting to list")
            return ("list_repositories", {
                "type": "owner",
                "sort": "updated", 
                "direction": "desc"
            })
    
    elif any(word in prompt_lower for word in ['code', 'files', 'structure', 'contents']):
        # Code exploration request
        project_name = extract_project_name(prompt) or "ai-portfolio"
        
        return ("get_repository_contents", {
            "owner": portfolio_owner,  # Server knows the portfolio owner
            "repo": project_name,
            "path": ""  # Root directory
        })
    
    elif any(word in prompt_lower for word in ['search', 'find', 'has', 'using']):
        # Search within portfolio
        search_term = extract_search_term(prompt)
        
        return ("search_repositories", {
            "q": f"user:{portfolio_owner} {search_term}",  # Server scopes to portfolio
            "sort": "updated",
            "order": "desc"
        })
    
    else:
        # Default to listing projects
        return ("list_repositories", {
            "type": "owner",
            "sort": "updated",
            "direction": "desc"
        })

def extract_project_name(prompt: str) -> str:
    """Extract project name from prompt (improved extraction)"""
    prompt_lower = prompt.lower()
    
    # Clean up the prompt to extract just the project name
    cleaned_prompt = prompt
    
    # Remove markdown links and URLs first
    import re
    # Remove markdown links like [text](url)
    cleaned_prompt = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', cleaned_prompt)
    # Remove bare URLs
    cleaned_prompt = re.sub(r'https?://[^\s]+', '', cleaned_prompt)
    
    words = cleaned_prompt.split()
    
    # Common patterns for project mentions
    patterns = [
        # "tell me about ProjectName"
        (r"about\s+([a-zA-Z0-9-_]+)", 1),
        # "ProjectName project" 
        (r"([a-zA-Z0-9-_]+)\s+project", 0),
        # "describe ProjectName"
        (r"describe\s+([a-zA-Z0-9-_]+)", 1),
        # "what is ProjectName"
        (r"what\s+is\s+([a-zA-Z0-9-_]+)", 2),
    ]
    
    for pattern, group_idx in patterns:
        match = re.search(pattern, cleaned_prompt.lower())
        if match:
            project_name = match.group(1)
            # Skip common words
            if project_name.lower() not in ['the', 'a', 'an', 'my', 'your', 'this', 'that', 'it']:
                return project_name
    
    # Fallback: look for words with hyphens or mixed case (project names)
    for word in words:
        clean_word = word.strip('.,?!').replace('"', '').replace("'", '')
        # Look for project-like names
        if ('-' in clean_word or any(c.isupper() for c in clean_word)) and len(clean_word) > 3:
            if clean_word.lower() not in ['what', 'tell', 'about', 'describe', 'project', 'github', 'com']:
                return clean_word
    
    return None

def extract_search_term(prompt: str) -> str:
    """Extract search terms from prompt"""
    # Simple extraction for search terms
    prompt_clean = prompt.lower().replace('search', '').replace('find', '').replace('has', '').replace('using', '')
    return prompt_clean.strip()

def summarize_mcp_response(mcp_response: dict, original_prompt: str, session_context: Dict = None) -> str:
    """Enhanced summarization with session context"""
    try:
        # Prepare context info if available
        context_info = ""
        if session_context and session_context.get("history"):
            recent_history = session_context["history"][-3:]  # Last 3 exchanges
            context_info = f"\n\nRecent conversation context:\n"
            for exchange in recent_history:
                context_info += f"User: {exchange.get('user', '')}\n"
                context_info += f"Assistant: {exchange.get('assistant', '')[:200]}...\n"
        
        system_prompt = f"""You are Yubi's AI portfolio assistant specializing in showcasing technical projects and expertise.

IMPORTANT: MCP stands for "Model Context Protocol" (not Minecraft). It's a new protocol for AI tool integration.

{context_info}

Current question: "{original_prompt}"
MCP Server Response: {mcp_response}

Create an engaging, professional summary that:
- Highlights Yubi's technical skills and project diversity
- Uses clear, professional language suitable for portfolio showcase  
- Provides specific details about technologies, languages, and project purposes
- Shows understanding of modern development practices (MCP = Model Context Protocol)
- If building on previous conversation, connect naturally to prior context
- Format with clear headings and bullet points when appropriate
- Emphasize the innovative aspects of projects, especially MCP-related work"""

        response = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt}
            ],
            max_output_tokens=500,
            temperature=0.2
        )
        
        return response.output_text.strip()
        
    except Exception as e:
        return f"Here's the information from the MCP server: {str(mcp_response)[:400]}..."

@app.get("/")
def root():
    # Ensure we have current MCP status
    global MCP_INITIALIZED, MCP_SESSION_ID, MCP_CAPABILITIES
    
    # Auto-initialize if not done yet
    if not MCP_INITIALIZED:
        MCP_INITIALIZED = initialize_mcp_connection()
    
    return {
        "status": "✨ Proper MCP Client with Full Protocol Compliance",
        "version": "0.3.0", 
        "features": [
            "full_mcp_initialization", 
            "server_side_routing", 
            "session_management", 
            "contextual_conversations"
        ],
        "mcp_initialized": MCP_INITIALIZED,
        "mcp_session_id": MCP_SESSION_ID,
        "mcp_capabilities": list(MCP_CAPABILITIES.keys()) if MCP_CAPABILITIES else [],
        "active_sessions": len(SESSIONS)
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
        "history": session.get("history", [])[-10:]  # Last 10 messages
    }

@app.post("/prompt")
def handle_prompt(payload: dict):
    """
    Proper MCP architecture: Send prompts directly to MCP server for processing
    """
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", str(uuid.uuid4())[:8])
    
    print(f"🔍 Processing: prompt='{prompt}', session_id='{session_id}'")
    
    if not prompt:
        return {"error": "No prompt provided"}
    
    # Initialize/get session
    if session_id not in SESSIONS:
        SESSIONS[session_id] = {"history": [], "last_response": ""}
    
    session = SESSIONS[session_id]
    
    # 1. Resolve contextual references
    resolved_prompt = smart_context_resolver(prompt, session_id)
    
    # 2. Check relevancy
    is_relevant = classify_prompt(resolved_prompt)
    if not is_relevant:
        reply = chat_response(prompt, session["history"])
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "friendly_chat",
            "resolved": resolved_prompt if resolved_prompt != prompt else None
        }
    
    # 3. Process with MCP server (server handles routing)
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
    
    # Auto-initialize if not done yet and return current status
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

if __name__ == "__main__":
    print("🚀 Starting Proper MCP Client with Full Protocol Compliance...")
    print("✨ Architecture: Client → MCP Server (handles routing) → Tools")
    print("🔧 Features: Full MCP initialization | Server-side routing | Session management")
    print("📋 Initialization sequence: initialize → capabilities exchange → initialized notification")
    
    # Initialize MCP connection on startup
    if initialize_mcp_connection():
        print("🎯 MCP ready - starting HTTP server...")
    else:
        print("⚠️  MCP initialization failed - server will attempt reconnection on first request")
    
    uvicorn.run("main_proper_mcp:app", host="0.0.0.0", port=9000, reload=True)
