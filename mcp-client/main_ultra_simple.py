# ✨ Ultra-Simplified MCP Client with Sessions (90% less code!)
import os
import requests
import json
import uuid
from typing import Dict, List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from dotenv import load_dotenv
import uvicorn

load_dotenv()

app = FastAPI(title="Ultra-Simple MCP Client with Sessions")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Simple constants
OPENAI_CLIENT = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MCP_SERVER_URL = os.getenv("MCP_SERVER_URL", "http://127.0.0.1:8000/mcp")

# Super simple session store - just track last response and conversation
SESSIONS: Dict[str, Dict] = {}

def classify_prompt(prompt: str) -> bool:
    """Proper relevancy classification (from working main.py)"""
    if not prompt.strip():
        return False
    
    system_prompt = (
        "You are a strict classifier. Reply with 'relevant' if the user prompt is about Yubi's personal projects (including all projects, some projects, or a particular project), skills, experiences, or anything related to Yubi's GitHub repositories. "
        "This includes questions like 'Tell me about your projects', 'Tell me about this project', 'What are your skills?', or 'Describe your experience'. "
        "Reply with 'irrelevant' if the prompt is about anything else (such as news, weather, sports, or general topics not related to Yubi's projects, skills, or experiences). Only reply with 'relevant' or 'irrelevant'."
    )
    
    try:
        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            max_output_tokens=256,
            temperature=0.0
        )
        label = resp.output[0].content[0].text.strip().lower()
        is_relevant = label == "relevant"
        return is_relevant
    except:
        return True  # Default to relevant if OpenAI fails

def chat_response(prompt: str, session_history: List[Dict]) -> str:
    """Generate friendly chat response for irrelevant prompts (from working main.py)"""
    try:
        # Use the same approach as the working main.py
        system_prompt = (
            "You are Yubi's AI portfolio assistant. If the user's question is not about Yubi's projects, skills, or experiences, reply kindly and conversationally. "
            "Greet the user if appropriate, and encourage them to ask about Yubi's projects, skills, or experiences."
        )
        
        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            max_output_tokens=256,
            temperature=0.5
        )
        return resp.output[0].content[0].text.strip()
    except Exception as e:
        return "I'm here to help with questions about Yubi's GitHub projects and coding skills. What would you like to know about the technical work?"

def get_mcp_tools() -> list:
    """Get MCP tools from server"""
    try:
        payload = {"jsonrpc": "2.0", "method": "tools/list", "params": {}, "id": str(uuid.uuid4())}
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        
        response = requests.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Handle SSE format
        if response.text.startswith("event:"):
            sse_lines = [line for line in response.text.splitlines() if line.startswith("data:")]
            if sse_lines:
                json_str = sse_lines[0][len("data:"):].strip()
                data = json.loads(json_str)
            else:
                raise Exception("No data lines in SSE response")
        else:
            data = response.json()
        
        return data.get("result", {}).get("tools", [])
    except:
        # Fallback to default tools if listing fails
        return [
            {"name": "list_repositories", "description": "List repositories", "inputSchema": {"type": "object", "properties": {"type": {"type": "string"}}}},
            {"name": "get_repository", "description": "Get repository details", "inputSchema": {"type": "object", "properties": {"owner": {"type": "string"}, "repo": {"type": "string"}}}},
            {"name": "search_repositories", "description": "Search repositories", "inputSchema": {"type": "object", "properties": {"q": {"type": "string"}}}}
        ]

def route_prompt(prompt: str) -> tuple[str, dict]:
    """Smart LLM-based routing (simplified from main.py)"""
    tools = get_mcp_tools()
    
    # Simplified routing system prompt
    system_prompt = """You are a router for Yubi's GitHub portfolio. Choose ONE tool and return JSON:
    {"name": "<tool_name>", "arguments": {...}}

    Tools:
    - list_repositories: For general project overviews, skills questions, technology searches
    - get_repository: For specific repository details (when exact repo name mentioned)  
    - get_repository_contents: For exploring code/files in repositories
    - search_repositories: For searching repositories by keywords

    Rules:
    - Skills/technologies questions → list_repositories
    - "Tell me about [specific repo]" → get_repository with owner="yubi00", repo="[repo_name]"
    - General project questions → list_repositories with type="owner"
    - Always add owner="yubi00" when required"""

    try:
        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=f"{system_prompt}\n\nUser prompt: {prompt}\nTools available: {[t['name'] for t in tools]}",
            max_output_tokens=200,
            temperature=0.0
        )
        
        response_text = resp.output[0].content[0].text.strip()
        
        # Extract JSON from response
        start = response_text.find("{")
        end = response_text.rfind("}")
        if start != -1 and end != -1:
            result = json.loads(response_text[start:end+1])
            tool_name = result.get("name", "list_repositories")
            arguments = result.get("arguments", {})
            
            # Auto-fix common issues
            if tool_name == "list_repositories" and not arguments:
                arguments = {"type": "owner"}
            
            # Auto-add owner for tools that need it
            if tool_name in ["get_repository", "get_repository_contents"] and "owner" not in arguments:
                arguments["owner"] = "yubi00"
                
            return tool_name, arguments
            
    except Exception as e:
        pass  # Fall back to simple routing
    
    # Fallback to simple routing
    prompt_lower = prompt.lower()
    if any(word in prompt_lower for word in ['list', 'projects', 'repositories', 'show me', 'what are', 'skills']):
        return "list_repositories", {"type": "owner"}
    else:
        return "list_repositories", {"type": "owner"}

def smart_context_resolver(prompt: str, session_id: str) -> str:
    """Super simple but smart context resolution using LLM + last response"""
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
        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=f"""CONTEXT RESOLVER: The user is referring to something from my previous response. 
            
Previous response: "{last_response}"
Current user question: "{prompt}"

If the user is referring to a specific project from the previous response, rewrite their question to be explicit.

Examples:
- "tell me about the second one" → "tell me about [specific project name from previous response]"  
- "I'm interested in the first project" → "I'm interested in [first project name mentioned]"
- "what about that one" → "what about [project name]"

Return ONLY the rewritten question, or the original if no specific project reference is found.""",
            max_output_tokens=100,
            temperature=0.0
        )
        
        resolved = resp.output[0].content[0].text.strip()
        if resolved != prompt and len(resolved) > 0:
            print(f"🔗 Context resolved: '{prompt}' → '{resolved}'")
            return resolved
            
    except Exception as e:
        print(f"Context resolution failed: {e}")
    
    return prompt

def summarize_with_context(prompt: str, mcp_response: dict, session_context: Dict) -> str:
    """Enhanced summarization with proper session context"""
    try:
        # Build conversation history context
        history = session_context.get("history", [])
        context = "\n".join([
            f"User: {msg['user']}\nAssistant: {msg['assistant']}" 
            for msg in history[-2:]  # Last 2 exchanges for context
        ])
        
        # Add structured project context for ordinal references
        context_info = ""
        if session_context.get("projects"):
            projects_list = session_context["projects"]
            context_info = "\n\nSESSION CONTEXT (for references like 'third project'):\n"
            for i, proj in enumerate(projects_list[:5], 1):
                context_info += f"{i}. {proj['name']} ({proj['key_tech']})\n"
            if len(projects_list) > 5:
                context_info += f"... and {len(projects_list) - 5} more projects\n"
        
        system_prompt = f"""You are Yubi's GitHub portfolio assistant. Provide a friendly, organized summary of the technical data.

Previous conversation:
{context}

Current question: "{prompt}"
Technical data: {mcp_response}
{context_info}

Provide a conversational, helpful summary that builds on our conversation."""

        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=system_prompt,
            max_output_tokens=400,
            temperature=0.2
        )
        return resp.output[0].content[0].text.strip()
    except Exception as e:
        return f"Here's the information I found: {str(mcp_response)[:300]}..."

def call_mcp_tool(tool_name: str, tool_args: dict) -> dict:
    """Proper MCP tool calling using the working approach from main.py"""
    payload = {
        "jsonrpc": "2.0",
        "method": "tools/call",
        "params": {"name": tool_name, "arguments": tool_args},
        "id": str(uuid.uuid4())
    }
    
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"
    }
    
    try:
        response = requests.post(MCP_SERVER_URL, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        
        # Handle SSE format (from working main.py)
        if response.text.startswith("event:"):
            sse_lines = [line for line in response.text.splitlines() if line.startswith("data:")]
            if sse_lines:
                json_str = sse_lines[0][len("data:"):].strip()
                data = json.loads(json_str)
            else:
                raise Exception("MCP server returned SSE format but no data lines found")
        else:
            # Fallback to regular JSON parsing
            data = response.json()
        
        # Check for errors
        if "error" in data:
            raise Exception(f"MCP server error: {data['error']}")
            
        return data
        
    except Exception as e:
        return {"error": f"Error calling MCP server: {str(e)}"}

@app.get("/")
def root():
    return {
        "status": "✨ Ultra-Simple MCP Client with Sessions", 
        "port": 9000,
        "lines_of_code": "~120",
        "features": ["session_management", "smart_routing", "friendly_chat", "mcp_integration"],
        "active_sessions": len(SESSIONS),
        "mcp_server": MCP_SERVER_URL
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
    """Super simple but smart prompt handler with context memory"""
    prompt = payload.get("prompt", "")
    session_id = payload.get("session_id", str(uuid.uuid4())[:8])
    
    # Debug logging
    print(f"🔍 Received request: prompt='{prompt}', session_id from payload={payload.get('session_id')}, using session_id='{session_id}'")
    
    if not prompt:
        return {"error": "No prompt provided"}
    
    # Initialize session if needed
    if session_id not in SESSIONS:
        print(f"📝 Creating new session: {session_id}")
        SESSIONS[session_id] = {"history": [], "last_response": ""}
    else:
        print(f"♻️  Using existing session: {session_id} (has {len(SESSIONS[session_id]['history'])} messages)")
    
    print(f"🗂️  Active sessions: {list(SESSIONS.keys())}")
    session = SESSIONS[session_id]
    
    # 1. Resolve contextual references using LLM + last response  
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
    
    # 3. Route to MCP tool
    tool_name, tool_args = route_prompt(resolved_prompt)
    
    # 4. Call MCP server
    mcp_response = call_mcp_tool(tool_name, tool_args)
    
    # 5. Handle errors
    if "error" in mcp_response:
        reply = f"I encountered an error: {mcp_response['error']}"
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        return {
            "reply": reply,
            "session_id": session_id,
            "source": "error",
            "resolved": resolved_prompt if resolved_prompt != prompt else None
        }
    
    # 6. Generate response with conversation context
    summary = simple_summarizer(resolved_prompt, mcp_response, session_id)
    
    # 7. Save to session
    session["history"].append({"user": prompt, "assistant": summary})
    session["last_response"] = summary
    
    return {
        "reply": summary,
        "session_id": session_id,
        "tool_used": f"{tool_name}({tool_args})",
        "source": "mcp_server", 
        "conversation_length": len(session["history"]),
        "resolved": resolved_prompt if resolved_prompt != prompt else None
    }

def simple_summarizer(prompt: str, mcp_response: dict, session_id: str) -> str:
    """Simple but effective summarizer that remembers conversation context"""
    try:
        # Get conversation history for context
        conversation_context = ""
        if session_id in SESSIONS and SESSIONS[session_id].get("history"):
            recent = SESSIONS[session_id]["history"][-2:]  # Last 2 exchanges
            conversation_context = "\n".join([
                f"Previous - User: {msg['user']}\nPrevious - Assistant: {msg['assistant']}" 
                for msg in recent
            ])
        
        context_prompt = f"""You are Yubi's GitHub portfolio assistant. Provide a friendly, conversational response.

{"Previous conversation:\n" + conversation_context + "\n" if conversation_context else ""}
Current question: "{prompt}"
Technical data: {mcp_response}

Give a natural, helpful response that builds on our conversation."""

        resp = OPENAI_CLIENT.responses.create(
            model="gpt-4o-mini",
            input=context_prompt,
            max_output_tokens=400,
            temperature=0.3
        )
        return resp.output[0].content[0].text.strip()
        
    except Exception as e:
        return f"Here's what I found: {str(mcp_response)[:300]}..."

if __name__ == "__main__":
    print("🚀 Starting Ultra-Simple MCP Client with Smart Context Memory...")
    print("✨ Features: Smart Context Resolution | Conversation Memory | LLM-based Reference Resolution")
    print("🎯 Context resolution examples:")
    print("   User: 'What are your last 3 projects?' → Assistant: [lists projects]")
    print("   User: 'Tell me about the second one' → Resolves to specific project name")
    print("   User: 'I'm interested in the first project' → Resolves to specific project name")
    uvicorn.run("main_ultra_simple:app", host="0.0.0.0", port=9000, reload=True)
