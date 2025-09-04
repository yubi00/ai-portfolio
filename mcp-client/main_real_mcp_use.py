import asyncio
import os
import logging
import uuid
from typing import Dict, Any, List
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from mcp_use import MCPAgent, MCPClient
import uvicorn

# Load environment variables (force reload)
load_dotenv(override=True)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# Global variables for MCP
mcp_agent = None
sessions: Dict[str, List[Dict]] = {}  # Changed to match ultra simple structure

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize MCP agent on startup"""
    global mcp_agent
    
    try:
        print("🚀 Initializing Real MCP-Use Agent...")
        
        # Configuration for our MCP server (using HTTP instead of stdio)
        config = {
            "mcpServers": {
                "yubi-github-http": {
                    "url": "http://localhost:8000/mcp",  # HTTP endpoint
                    "headers": {
                        "Accept": "application/json, text/event-stream",
                        "Content-Type": "application/json"
                    }
                }
            }
        }
        
        # Create MCPClient from configuration
        client = MCPClient.from_dict(config)
        
        # Create LLM
        openai_api_key = os.getenv("OPENAI_API_KEY")
        if not openai_api_key:
            raise Exception("OPENAI_API_KEY not found in environment variables")
        
        logger.info(f"🔑 LangChain using API key: {openai_api_key[:20]}...")
        
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=openai_api_key,
            temperature=0.1
        )
        
        # Create agent with built-in memory
        mcp_agent = MCPAgent(
            llm=llm, 
            client=client, 
            max_steps=10,
            memory_enabled=True,  # Enable conversation memory
            verbose=True  # Enable verbose logging
        )
        
        print("✅ MCP-Use Agent initialized successfully!")
        yield
        
    except Exception as e:
        print(f"❌ Failed to initialize MCP agent: {e}")
        raise
    finally:
        print("🔄 Shutting down MCP agent...")

# Create FastAPI app with lifespan
app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Frontend URLs
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def classify_prompt(prompt: str) -> bool:
    """Check if prompt is related to Yubi's skills/projects"""
    
    # First check for simple greetings and non-tech patterns
    prompt_lower = prompt.lower().strip()
    
    # Simple greetings should NOT be tech
    simple_greetings = ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"]
    if any(greeting == prompt_lower or prompt_lower.startswith(greeting + " ") for greeting in simple_greetings):
        logger.info(f"🏷️ Classification: Simple greeting detected -> Non-tech")
        return False
    
    # Other obvious non-tech patterns
    non_tech_patterns = ["weather", "how are you", "what's your name", "who are you", "thank you", "thanks"]
    if any(pattern in prompt_lower for pattern in non_tech_patterns):
        logger.info(f"🏷️ Classification: Non-tech pattern detected -> Non-tech")
        return False
    
    # Now check for tech keywords
    tech_keywords = [
        # Core tech terms (removed "yubi" to avoid false positives)
        "project", "repository", "repo", "github", "code", "programming",
        "skill", "technology", "tech", "development", "software", "app",
        "portfolio", "work", "experience", 
        
        # Programming languages
        "python", "javascript", "typescript", "java", "c++", "go", "rust",
        "react", "node", "vue", "angular", "django", "flask", "fastapi",
        
        # Technologies
        "api", "web", "mobile", "game", "tool", "database", "sql",
        "docker", "kubernetes", "aws", "cloud", "machine learning", "ai",
        "backend", "frontend", "fullstack", "devops",
        
        # Question patterns
        "what projects", "what have you built", "what technologies",
        "what languages", "show me", "tell me about", "what experience",
        "what skills", "what tools"
    ]
    
    is_tech = any(keyword in prompt_lower for keyword in tech_keywords)
    
    logger.info(f"🏷️ Classification details: '{prompt_lower}' -> Tech-related: {is_tech}")
    return is_tech

def resolve_contextual_references(prompt: str, session_history: List[Dict]) -> str:
    """Simple contextual reference resolution (from ultra simple version)"""
    if not session_history:
        return prompt
        
    # Check for contextual references
    prompt_lower = prompt.lower()
    if any(ref in prompt_lower for ref in ["the second one", "second project", "the first one", "first project", "that project", "this project", "it"]):
        # Get the last assistant response for context
        last_response = session_history[-1].get('assistant', '') if session_history else ''
        
        # Use LLM to resolve the reference
        try:
            llm = ChatOpenAI(
                model="gpt-4o-mini",
                api_key=os.getenv("OPENAI_API_KEY"),
                temperature=0.1,
                max_tokens=100
            )
            
            content = f"""Resolve this contextual reference based on the conversation:

Last response: "{last_response}"
Current prompt: "{prompt}"

If the current prompt refers to a specific project mentioned in the last response, rewrite the prompt to be explicit. For example:
- "Tell me more about the second one" -> "Tell me more about [specific project name]"
- "What technologies does it use?" -> "What technologies does [project name] use?"

Return ONLY the rewritten prompt, nothing else."""

            response = llm.invoke([{"role": "user", "content": content}])
            resolved = response.content.strip()
            logger.info(f"🔗 Resolved reference: '{prompt}' -> '{resolved}'")
            return resolved
        except:
            logger.warning(f"⚠️ Failed to resolve contextual reference, using original prompt")
            return prompt
            
    return prompt

def summarize_with_context(prompt: str, data: str, session_history: List[Dict]) -> str:
    """Ultra-simple summarization with session context (from ultra simple version)"""
    try:
        # Build conversation context  
        context = "\n".join([
            f"User: {msg['user']}\nAssistant: {msg['assistant']}" 
            for msg in session_history[-2:]  # Last 2 exchanges for context
        ])
        
        system_prompt = f"""You are Yubi's GitHub portfolio assistant. Provide a friendly, organized summary of the technical data.

Previous conversation:
{context}

Current question: "{prompt}"
Technical data: {data}

Give a helpful response that:
1. Directly answers the user's question
2. Organizes information clearly
3. Maintains conversational context
4. Is concise but informative"""

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.7,
            max_tokens=400
        )
        
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        response = llm.invoke(messages)
        return response.content.strip()
    except Exception as e:
        logger.error(f"❌ Summarization error: {e}")
        # Fallback to simple data presentation
        return f"Here's the information I found: {data[:300]}..."

def friendly_response(prompt: str) -> str:
    """Generate friendly chat response using LangChain (consistent with the rest of the app)"""
    try:
        # Create a simple LangChain LLM instance for friendly responses
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            api_key=os.getenv("OPENAI_API_KEY"),
            temperature=0.7,
            max_tokens=256
        )
        
        # Improved system prompt for better personalized responses
        system_prompt = (
            "You are Yubi's friendly AI assistant. Respond warmly and personally to the user. "
            "For greetings like 'hi' or 'hello', greet them back and introduce yourself as Yubi's AI assistant. "
            "For other non-technical questions, respond kindly and conversationally, then mention you can help with questions about Yubi's programming projects, skills, and experiences. "
            "Keep responses friendly, natural, and conversational - not robotic or overly formal."
        )
        
        logger.info(f"🤖 Using LangChain for friendly response to: '{prompt}'")
        
        # Use LangChain's invoke method
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ]
        
        response = llm.invoke(messages)
        llm_response = response.content.strip()
        
        logger.info(f"✅ LangChain response: '{llm_response[:100]}{'...' if len(llm_response) > 100 else ''}'")
        return llm_response
        
    except Exception as e:
        logger.error(f"❌ Friendly response error: {e}")
        logger.error(f"❌ Falling back to hardcoded response for prompt: '{prompt}'")
        # Better fallback based on the prompt type
        if any(greeting in prompt.lower() for greeting in ["hello", "hi", "hey"]):
            return "Hi! I'm Yubi's AI assistant. I'm here to help answer questions about his programming projects, technical skills, and development experience. What would you like to know?"
        else:
            return "I'm here to help with questions about Yubi's GitHub projects and coding skills. What would you like to know about the technical work?"

@app.get("/")
async def root():
    """Status endpoint"""
    global mcp_agent
    
    return {
        "status": "MCP-Use Agent Running" if mcp_agent else "Agent Not Initialized",
        "port": 9002,
        "approach": "Real mcp-use with built-in memory",
        "features": [
            "🧠 Built-in agent memory",
            "🔗 Direct MCP server integration", 
            "🤖 LangChain LLM integration",
            "💬 Contextual conversations",
            "🎯 Smart relevancy detection"
        ],
        "active_sessions": len(sessions),
        "agent_ready": mcp_agent is not None
    }

@app.post("/prompt")
async def handle_prompt(payload: dict):
    """Handle user prompts with mcp-use agent"""
    global mcp_agent, sessions
    
    if not mcp_agent:
        raise HTTPException(status_code=503, detail="MCP agent not initialized")
    
    prompt = payload.get("prompt", "").strip()
    session_id = payload.get("session_id", str(uuid.uuid4()))
    
    logger.info(f"📝 Received prompt from session {session_id}: {prompt[:100]}{'...' if len(prompt) > 100 else ''}")
    
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")
    
    # Initialize session if needed
    if session_id not in sessions:
        sessions[session_id] = []
    
    session_history = sessions[session_id]
    
    try:
        # 1. Resolve contextual references first (like ultra simple)
        resolved_prompt = resolve_contextual_references(prompt, session_history)
        
        # 2. Check if prompt is relevant to Yubi's projects
        is_tech_related = classify_prompt(resolved_prompt)
        logger.info(f"🔍 Prompt classification: {'TECH' if is_tech_related else 'GENERAL'} - '{resolved_prompt[:50]}{'...' if len(resolved_prompt) > 50 else ''}'")
        
        if not is_tech_related:
            # Handle non-tech questions with friendly response - NO MCP needed
            logger.info(f"💬 Using friendly chat for non-tech question")
            reply = friendly_response(resolved_prompt)
            source_indicator = "🤖"
        else:
            # Use mcp-use agent for tech questions
            logger.info(f"🧠 Using MCP agent for tech question")
            try:
                # Phase 1: Running MCP agent
                logger.info(f"🔍 Phase 1: Querying GitHub data via MCP agent...")
                result = await mcp_agent.run(resolved_prompt)
                raw_data = str(result) if result else "I couldn't find information about that."
                logger.info(f"📊 Phase 1 complete: Retrieved {len(raw_data)} characters of data")
                
                # Phase 2: Summarizing with context
                logger.info(f"📝 Phase 2: Summarizing response with conversation context...")
                reply = summarize_with_context(resolved_prompt, raw_data, session_history)
                source_indicator = "🧠 Agent"
                logger.info(f"✅ Phase 2 complete: Generated {len(reply)} character response")
            except Exception as mcp_error:
                logger.error(f"❌ MCP agent error: {mcp_error}")
                # Fallback to friendly response if MCP fails
                logger.info(f"🔄 Falling back to friendly response due to MCP error")
                reply = f"I'm having trouble accessing my GitHub data right now, but I'm here to help with questions about Yubi's programming projects and technical skills. Could you try asking again or rephrase your question?"
                source_indicator = "⚠️ Fallback"
        
        # 4. Store in session history (like ultra simple structure)
        sessions[session_id].append({
            "user": prompt,  # Original prompt
            "assistant": reply
        })
        
        logger.info(f"✅ Response generated ({source_indicator}) - Length: {len(reply)} chars")
        
        return {
            "reply": reply,
            "source_indicator": source_indicator,
            "session_id": session_id,
            "conversation_length": len(sessions[session_id])
        }
        
    except Exception as e:
        logger.error(f"❌ Error processing prompt: {str(e)}")
        error_reply = f"Sorry, I encountered an error: {str(e)}"
        
        # Store error in session history (ultra simple structure)
        sessions[session_id].append({
            "user": prompt,
            "assistant": error_reply
        })
        
        return {
            "reply": error_reply,
            "source_indicator": "❌ Error", 
            "session_id": session_id,
            "conversation_length": len(sessions[session_id])
        }

@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session history"""
    return {
        "session_id": session_id,
        "history": sessions.get(session_id, []),
        "length": len(sessions.get(session_id, []))
    }

if __name__ == "__main__":
    print("🚀 Starting Real MCP-Use Version...")
    print("📊 Expected: ~100 lines with built-in memory!")
    print("🧠 Approach: Real mcp-use package with agent memory")
    
    uvicorn.run(
        "main_real_mcp_use:app", 
        host="0.0.0.0", 
        port=9000, 
        reload=True
    )