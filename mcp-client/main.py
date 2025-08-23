from openai import OpenAI
import os
import uuid
import requests
from fastapi import FastAPI, Body, HTTPException
from fastapi.concurrency import run_in_threadpool
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
import json
import re
from typing import Any, Dict, List, Tuple
from dotenv import load_dotenv
import logging

# Configure logging
def setup_logging():
    """Setup logging configuration based on environment"""
    # Use INFO level for production, DEBUG for development
    log_level = logging.DEBUG if os.getenv("DEBUG", "false").lower() == "true" else logging.INFO
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Setup console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)
    
    # Setup logger
    logger = logging.getLogger(__name__)
    logger.setLevel(log_level)
    logger.addHandler(console_handler)
    
    # Prevent duplicate logs
    logger.propagate = False
    
    return logger

logger = setup_logging()

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

def _list_mcp_tools() -> List[Dict[str, Any]]:
    """Fetch the tool catalog from the MCP server."""
    _ensure_initialized()
    data = _rpc({"method": "tools/list", "params": {}})
    # FastMCP typically returns: {"result": {"tools": [ {name, description, inputSchema}, ... ]}}
    tools = data.get("result", {}).get("tools", [])
    return tools

def _json_only(text: str) -> Dict[str, Any]:
    """
    Extract a single top-level JSON object from model output.
    This is defensive in case the model adds extra prose.
    """
    # Dumb but reliable brace matching
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("No JSON object found in model output.")
    return json.loads(text[start:end+1])

def _choose_tool_with_llm(user_prompt: str, tools: List[Dict[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    """
    Ask the model to pick one tool and craft arguments that fit the tool's inputSchema.
    Returns (tool_name, arguments_dict).
    """
    # Minify the tool catalog we pass to the model
    condensed = []
    for t in tools:
        condensed.append({
            "name": t.get("name"),
            "description": t.get("description"),
            "schema": t.get("inputSchema"),  # should be JSON Schema
        })
    
    logger.debug(f"Tool catalog passed to router: {[t['name'] for t in condensed]}")

    system = (
        "You are a router for Yubi's GitHub portfolio assistant. Given a natural language prompt and a catalog of MCP tools, "
        "choose exactly ONE tool and produce ONLY a compact JSON object with fields:\n"
        "{ \"name\": <tool_name>, \"arguments\": { ... } }.\n"
        "Arguments MUST conform to the tool's JSON Schema (types and required fields).\n\n"
        
        "ROUTING RULES:\n\n"
        
        "1. GENERAL PROJECT OVERVIEW → use 'list_repositories':\n"
        "   - 'What are your projects?', 'Show me your work', 'List your repositories'\n"
        "   - 'What have you built?', 'Show me your recent projects'\n"
        "   - 'How many projects do you have?', 'What's your latest work?'\n"
        "   - Use default arguments or sort='updated' for recent projects\n\n"
        
        "2. SPECIFIC PROJECT DETAILS → use 'get_repository':\n"
        "   - 'Tell me about [project]', 'What is [project]?', 'Describe [project]'\n"
        "   - 'What does [project] do?', 'What's the tech stack for [project]?'\n"
        "   - Always use owner='yubi00' if not specified\n"
        "   - NEVER use 'project' as repo name unless user explicitly says so\n\n"
        
        "3. TECHNOLOGY/TOPIC SEARCH → use 'list_repositories':\n"
        "   - 'Do you have [technology] projects?', 'Show me [language] projects'\n"
        "   - 'Projects using [framework]', 'Find projects about [topic]'\n"
        "   - 'AI projects', 'React projects', 'blockchain projects', 'machine learning projects'\n"
        "   - When searching by technology/keyword, use list_repositories and let summarizer filter\n\n"
        
        "4. CODE/FILES EXPLORATION → use 'get_repository_contents':\n"
        "   - 'Show me the code for [project]', 'What's in [project] repository?'\n"
        "   - 'Show me files in [project]', 'Project structure of [project]'\n"
        "   - 'Show me README of [project]', 'What's in [folder] of [project]?'\n"
        "   - Use owner='yubi00', set path='' for root or specific path if mentioned\n\n"
        
        "5. SKILLS/EXPERTISE SUMMARY → use 'list_repositories':\n"
        "   - 'What are your skills?', 'What technologies do you use?'\n"
        "   - 'What programming languages?', 'What's your tech stack?'\n"
        "   - 'Technical expertise', 'What frameworks do you work with?'\n\n"
        
        "PRIORITY: If question could match multiple categories, choose in this order:\n"
        "get_repository > get_repository_contents > list_repositories\n\n"
        
        "If no tool is appropriate, return {\"name\":\"__none__\",\"arguments\":{}}.\n"
        "Do not include explanations."
    )

    rsp = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system},
            {"role": "user", "content": [
                {"type": "input_text", "text": f"TOOL_CATALOG:\n{json.dumps(condensed, ensure_ascii=False)}\n\nUSER_PROMPT:\n{user_prompt}"}
            ]},
        ],
        temperature=0.0,
        max_output_tokens=256,
    )

    routed = _json_only(rsp.output_text.strip())
    name = routed.get("name")
    arguments = routed.get("arguments", {}) if isinstance(routed.get("arguments", {}), dict) else {}
    
    # Debug: Show router decision with raw output
    logger.debug(f"Router selected tool: {name} (from {len(tools)} available tools)")
    logger.debug(f"Router raw arguments: {arguments}")
    # Auto-fix common argument issues
    if name == "list_repositories":
        # Provide sensible defaults for list_repositories
        if arguments.get("sort") is None:
            arguments["sort"] = "updated"
            logger.debug("Fixed sort=None → sort='updated'")
        if arguments.get("direction") is None:
            arguments["direction"] = "desc" 
            logger.debug("Fixed direction=None → direction='desc'")
        if arguments.get("type") is None:
            arguments["type"] = "all"
            logger.debug("Fixed type=None → type='all'")
    
    # If the tool requires an 'owner' argument and it's missing, hardcode to 'yubi00'
    if name and any(
        t.get("name") == name and "owner" in (t.get("inputSchema", {}).get("properties", {}))
        for t in tools
    ):
        if "owner" not in arguments or not arguments["owner"]:
            arguments["owner"] = "yubi00"
            logger.debug("Auto-added owner='yubi00' to arguments")
            logger.debug(f"Updated arguments after owner injection: {arguments}")
    if not name:
        raise ValueError("Router did not return a tool name.")
    return name, arguments

def _light_validate(tools: List[Dict[str, Any]], name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Very light validation: check tool exists, required properties present, and types basic check.
    (Keeps deps minimal; swap for jsonschema if you want strict validation.)
    """
    logger.debug(f"Validating tool '{name}' with arguments: {arguments}")
    match = next((t for t in tools if t.get("name") == name), None)
    if not match:
        raise HTTPException(status_code=400, detail=f"Unknown tool selected: {name}")

    schema = (match.get("inputSchema") or {}).copy()
    if schema.get("type") != "object":
        return match  # nothing smart to do

    required = schema.get("required", [])
    props = schema.get("properties", {})

    # required fields
    missing = [r for r in required if r not in arguments]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required argument(s) for {name}: {', '.join(missing)}")

    # loose type checks (string, number, integer, boolean, object)
    def _check_type(val, typ) -> bool:
        if typ == "string": return isinstance(val, str)
        if typ == "number": return isinstance(val, (int, float))
        if typ == "integer": return isinstance(val, int) and not isinstance(val, bool)
        if typ == "boolean": return isinstance(val, bool)
        if typ == "object": return isinstance(val, dict)
        if typ == "array": return isinstance(val, list)
        # enums
        return True

    for k, v in arguments.items():
        if k in props:
            p = props[k]
            types = p.get("type")
            enum = p.get("enum")
            if enum and v not in enum:
                raise HTTPException(status_code=400, detail=f"Argument '{k}' must be one of {enum}, got {v!r}")
            if types:
                # allow union types
                if isinstance(types, list):
                    if not any(_check_type(v, t) for t in types):
                        raise HTTPException(status_code=400, detail=f"Argument '{k}' has wrong type for {name}.")
                else:
                    if not _check_type(v, types):
                        raise HTTPException(status_code=400, detail=f"Argument '{k}' has wrong type for {name}.")
    return match



# Summarize MCP server JSON response for user display
def summarize(mcp_response: dict, user_prompt: str) -> str:
    logger.debug(f"Summarizing response for prompt: '{user_prompt[:60]}...'")
    logger.debug(f"MCP response structure: {type(mcp_response)} with {len(str(mcp_response))} chars")
    
    # Log formatted MCP response for summarization analysis
    if isinstance(mcp_response, dict):
        try:
            # Only log the result part to avoid duplication, and truncate if too long
            result_part = mcp_response.get('result', {})
            if isinstance(result_part, dict) and 'content' in result_part:
                content = result_part['content']
                if isinstance(content, list) and len(content) > 0:
                    # For content arrays, show structure and first few items
                    logger.debug(f"Content structure: {len(content)} items of type {type(content[0]) if content else 'unknown'}")
                    if len(str(content)) > 2000:  # If content is too long, show summary
                        logger.debug(f"Content sample (first 500 chars): {str(content)[:500]}...")
                    else:
                        logger.debug(f"Full content: {json.dumps(content, indent=2, ensure_ascii=False)}")
                else:
                    logger.debug(f"Content: {json.dumps(content, indent=2, ensure_ascii=False) if content else 'Empty'}")
            else:
                logger.debug(f"Result part: {json.dumps(result_part, indent=2, ensure_ascii=False) if result_part else 'Empty'}")
        except (TypeError, ValueError) as e:
            logger.debug(f"Could not format response for summarization: {e}")
    
    # Detect if the user is asking about skills/technologies
    skills_keywords = ['skills', 'technologies', 'familiar', 'tech stack', 'programming languages', 'frameworks', 'expertise', 'technologies do you use', 'what do you know']
    is_skills_question = any(keyword.lower() in user_prompt.lower() for keyword in skills_keywords)
    logger.debug(f"Skills question detected: {is_skills_question} (matched keywords: {[kw for kw in skills_keywords if kw.lower() in user_prompt.lower()]})")
    
    if is_skills_question:
        system_prompt = (
            "You are Yubi's AI portfolio assistant. The user asked about skills/technologies. "
            "Analyze the repository data and extract a comprehensive summary of Yubi's technical skills. "
            "Group technologies by category (Programming Languages, Frameworks, Tools, etc.). "
            "Based on the repository names, descriptions, and languages, identify the key technologies Yubi works with. "
            "Present this as a friendly, organized summary of skills and expertise, NOT a list of repositories. "
            "Focus on the technologies, not the project details."
        )
    else:
        # Detect different question types for better responses
        specific_project_keywords = ['tell me about', 'describe', 'what is', 'what does', 'how does']
        code_exploration_keywords = ['show me the code', 'files in', 'structure of', 'contents of', 'what\'s in', 'readme']
        search_keywords = [
            'do you have', 'projects using', 'projects with', 'find projects',
            'does yubi know', 'does yubi use', 'yubi know', 'know rust', 'know python', 'know go', 'know java',
            'experience with', 'familiar with', 'work with', 'projects in', 'any rust', 'any python', 'any go',
            'programming language', 'programming in'
        ]
        overview_keywords = ['what are your projects', 'show me your work', 'list your', 'what have you built']
        
        user_prompt_lower = user_prompt.lower()
        
        # Detect which question type this is
        if any(keyword in user_prompt_lower for keyword in specific_project_keywords):
            question_type = "specific_project"
            matched_keywords = [kw for kw in specific_project_keywords if kw in user_prompt_lower]
            # Specific project details question
            system_prompt = (
                "You are Yubi's AI portfolio assistant. The user asked about a specific project. "
                "Present the project details in a clear, organized way. Include key information like: "
                "description, technologies used, features, GitHub link, stats (stars/forks), and when it was created/updated. "
                "Make it informative and engaging, highlighting what makes this project interesting or unique."
            )
        elif any(keyword in user_prompt_lower for keyword in code_exploration_keywords):
            question_type = "code_exploration"
            matched_keywords = [kw for kw in code_exploration_keywords if kw in user_prompt_lower]
            # Code/file exploration question
            system_prompt = (
                "You are Yubi's AI portfolio assistant. The user wants to explore code or repository contents. "
                "If showing directory contents, organize files clearly and explain the project structure. "
                "If showing code, present it in a readable format with brief explanations of key parts. "
                "Focus on helping the user understand the codebase and its organization."
            )
        elif any(keyword in user_prompt_lower for keyword in search_keywords):
            question_type = "technology_search"
            matched_keywords = [kw for kw in search_keywords if kw in user_prompt_lower]
            # Technology/topic search question
            system_prompt = (
                "You are Yubi's AI portfolio assistant. The user is searching for projects with specific technologies/topics. "
                "IMPORTANT: Look through the repository list and ONLY show projects that match what the user is looking for. "
                "If you find matching projects, present them with descriptions and explain how they relate to the search topic. "
                "If NO projects match the search criteria, respond honestly: 'Based on Yubi's current repository portfolio, there are no projects that use [technology/topic] as the primary technology.' "
                "Then briefly summarize what technologies Yubi DOES work with. "
                "End with: 'If you're interested in exploring Yubi's actual technology stack, I'd be happy to show you the projects he's built with these technologies!' "
                "Do NOT list unrelated projects or offer general programming help outside of Yubi's portfolio."
            )
        elif any(keyword in user_prompt_lower for keyword in overview_keywords):
            question_type = "project_overview"
            matched_keywords = [kw for kw in overview_keywords if kw in user_prompt_lower]
            # General project overview question
            system_prompt = (
                "You are Yubi's AI portfolio assistant. The user wants an overview of Yubi's projects. "
                "Present the repositories in an organized, engaging way. Group them logically if possible (by technology, purpose, etc.). "
                "Include names, brief descriptions, key technologies, and GitHub links. "
                "Make it a compelling portfolio showcase that highlights the breadth and quality of work."
            )
        else:
            question_type = "default"
            matched_keywords = []
            # Default/fallback for other question types
            system_prompt = (
                "You are Yubi's AI portfolio assistant. Generate a helpful, contextual response based on the user's question. "
                "Present the information clearly and conversationally. Focus on what the user is specifically asking about. "
                "If showing repositories, include relevant details like descriptions and links. "
                "If showing technical details, explain them in an accessible way."
            )
        
        logger.debug(f"Question type detected: {question_type} (matched: {matched_keywords})")
    response = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"User question: {user_prompt}\nMCP server response: {mcp_response}"}
        ],
        max_output_tokens=1024,
        temperature=0.2,
    )
    summary = response.output_text.strip()
    logger.info(f"Generated {len(summary)} char summary for question type: {'skills' if is_skills_question else 'other'}")
    return summary

# Classifier: returns True if prompt is relevant, else False
def classify_prompt(prompt: str) -> bool:
    if not prompt.strip():
        return False
    system_prompt = (
        "You are a strict classifier. Reply with 'relevant' if the user prompt is about Yubi's personal projects (including all projects, some projects, or a particular project), skills, experiences, or anything related to Yubi's GitHub repositories. "
        "This includes questions like 'Tell me about your projects', 'Tell me about this project', 'What are your skills?', or 'Describe your experience'. "
        "Reply with 'irrelevant' if the prompt is about anything else (such as news, weather, sports, or general topics not related to Yubi's projects, skills, or experiences). Only reply with 'relevant' or 'irrelevant'."
    )
    response = client.responses.create(
        model="gpt-4o-mini",
        input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt}
        ],
        max_output_tokens=256,
        temperature=0.0,
    )
    label = response.output_text.strip().lower()
    is_relevant = label == "relevant"
    logger.info(f"Classified prompt '{prompt[:50]}...' as {label.upper()} → {'Processing with MCP' if is_relevant else 'Generic response'}")
    return is_relevant


def _rpc(payload: dict, timeout: int = 120) -> dict:
    """Send a JSON-RPC call to the MCP server (HTTP)."""
    payload.setdefault("jsonrpc", "2.0")
    payload.setdefault("id", str(uuid.uuid4()))
    
    # Log the complete RPC payload being sent
    logger.debug(f"Sending RPC payload:\n{json.dumps(payload, indent=2, ensure_ascii=False)}")
    r = _session.post(MCP_SERVER_URL, json=payload, timeout=timeout)
    r.raise_for_status()
    # MCP server returns SSE format, try SSE parsing first
    if r.text.startswith("event:"):
        logger.debug("Detected SSE response format, parsing as SSE")
        sse_lines = [line for line in r.text.splitlines() if line.startswith("data:")]
        if sse_lines:
            try:
                # Take the first data: line, strip 'data: ' and parse as JSON
                json_str = sse_lines[0][len("data:"):].strip()
                data = json.loads(json_str)
            except Exception as sse_e:
                raise HTTPException(status_code=502, detail=f"MCP server SSE data could not be parsed as JSON. Error: {sse_e}. Raw: {sse_lines[0]}")
        else:
            raise HTTPException(status_code=502, detail=f"MCP server returned SSE format but no data lines found. Raw response: {r.text}")
    else:
        # Fallback to regular JSON parsing
        try:
            logger.debug("Attempting regular JSON parsing")
            data = r.json()
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"MCP server did not return valid JSON or SSE format. Error: {e}. Raw response: {r.text}")
    # Log MCP call results with response details
    method = payload.get('method', 'unknown')
    if "error" in data:
        logger.error(f"MCP {method} failed: {data.get('error', {}).get('message', 'Unknown error')}")
        logger.debug(f"Full error response: {json.dumps(data.get('error', {}), indent=2)}")
    else:
        logger.debug(f"MCP {method} completed successfully")
        # Log response size/type without the full content (too verbose)
        result = data.get('result', {})
        if isinstance(result, dict):
            logger.debug(f"Response contains: {list(result.keys())} with sizes: {[(k, len(str(v))) for k, v in result.items()]}")
            # Log formatted JSON for easier reading (only at DEBUG level)
            try:
                logger.debug(f"MCP Response JSON (formatted):\n{json.dumps(data, indent=2, ensure_ascii=False)}")
            except (TypeError, ValueError) as e:
                logger.debug(f"Could not format MCP response as JSON: {e}")
        else:
            logger.debug(f"Response type: {type(result)}, length: {len(str(result)) if result else 0}")
            # Log non-dict response
            logger.debug(f"MCP Response (raw): {result}")
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
    Accepts:
      1) {"prompt":"..."}  -> routes to best MCP tool, calls it, summarizes result
      2) {"name":"<toolName>", "arguments":{...}} -> directly calls a specific tool
      3) {"method":"tools/call"|"tools/list"|..., "params":{...}} -> passthrough JSON-RPC
    """
    # Log incoming request details
    logger.info(f"Received request with payload keys: {list(payload.keys())}")
    logger.debug(f"Full request payload: {json.dumps(payload, indent=2)}")

    def send_request():
        # Passthrough JSON-RPC if caller supplies method explicitly
        if "method" in payload:
            _ensure_initialized()
            return _rpc(payload)

        # Direct tool call if provided
        if "name" in payload:
            _ensure_initialized()
            name = payload["name"]
            arguments = payload.get("arguments", {})
            logger.info(f"Direct tool call: {name}")
            logger.debug(f"Direct call arguments: {arguments}")
            # Optional: validate against catalog
            tools = _list_mcp_tools()
            _light_validate(tools, name, arguments)
            result = _rpc({"method": "tools/call", "params": {"name": name, "arguments": arguments}})
            return result

        # Free text prompt → classify → route → MCP → summarize
        if "prompt" in payload:
            prompt = payload["prompt"].strip()
            if not prompt:
                return {"result": "Please enter a non-empty prompt."}
            
            logger.info(f"Processing request: '{prompt}'")


            # Always let the LLM respond, but if not relevant, ask for a kind, context-aware reply
            is_relevant = classify_prompt(prompt)
            if not is_relevant:
                # Use OpenAI to generate a kind, conversational response
                system_prompt = (
                    "You are Yubi's AI portfolio assistant. If the user's question is not about Yubi's projects, skills, or experiences, reply kindly and conversationally. "
                    "Greet the user if appropriate, and encourage them to ask about Yubi's projects, skills, or experiences."
                )
                response = client.responses.create(
                    model="gpt-4o-mini",
                    input=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt}
                    ],
                    max_output_tokens=256,
                    temperature=0.5,
                )
                irrelevant_response = {"result": response.output_text.strip()}
                logger.debug(f"Irrelevant prompt response:\n{json.dumps(irrelevant_response, indent=2, ensure_ascii=False)}")
                return irrelevant_response

            _ensure_initialized()
            tools = _list_mcp_tools()

            # Ask the model to pick the MCP tool + args
            try:
                tool_name, arguments = _choose_tool_with_llm(prompt, tools)
            except Exception as e:
                routing_error_response = {"error": f"Failed to route prompt: {e}"}
                logger.debug(f"Routing error response:\n{json.dumps(routing_error_response, indent=2, ensure_ascii=False)}")
                return routing_error_response

            if tool_name == "__none__":
                no_tool_response = {"result": "I couldn't find a matching GitHub tool for that request. Try asking about repos, a specific repo, or files in a repo."}
                logger.debug(f"No tool found response:\n{json.dumps(no_tool_response, indent=2, ensure_ascii=False)}")
                return no_tool_response

            # Validate against schema (light)
            try:
                _light_validate(tools, tool_name, arguments)
            except HTTPException as he:
                validation_error_response = {"error": he.detail}
                logger.debug(f"Validation error response:\n{json.dumps(validation_error_response, indent=2, ensure_ascii=False)}")
                return validation_error_response

            # Log tool routing and call details
            logger.info(f"Routing '{prompt[:40]}...' to {tool_name} with {len(arguments)} args")
            logger.debug(f"Final arguments being sent to {tool_name}: {json.dumps(arguments, indent=2)}")
            logger.debug(f"Tool call summary: {tool_name}({', '.join(f'{k}={v}' for k, v in arguments.items())})")
            
            # Call MCP with proper error handling
            try:
                mcp_response = _rpc({
                    "method": "tools/call",
                    "params": {
                        "name": tool_name,
                        "arguments": arguments,
                    },
                })
            except HTTPException as e:
                logger.error(f"MCP server failed: {e.detail}")
                error_response = {
                    "error": "MCP Server Unavailable", 
                    "result": f"I'm sorry, but I'm currently unable to access my project database to provide specific information about Yubi's {prompt.lower()}. The data source is temporarily unavailable. Please try again later or ask about something else."
                }
                logger.debug(f"Error response:\n{json.dumps(error_response, indent=2, ensure_ascii=False)}")
                return error_response
            except Exception as e:
                logger.error(f"Unexpected error calling MCP server: {str(e)}")
                error_response = {
                    "error": "System Error", 
                    "result": f"I encountered an unexpected error while trying to access Yubi's project information. Please try again later."
                }
                logger.debug(f"System error response:\n{json.dumps(error_response, indent=2, ensure_ascii=False)}")
                return error_response

            # Log successful MCP response details
            logger.debug(f"MCP response keys: {list(mcp_response.keys()) if isinstance(mcp_response, dict) else 'Not a dict'}")
            
            # Log formatted result data for easier analysis
            result_data = mcp_response.get('result', {})
            logger.debug(f"Result data type: {type(result_data)}, empty: {not bool(result_data)}")
            
            if result_data and isinstance(result_data, dict):
                try:
                    logger.debug(f"Result Data JSON (formatted):\n{json.dumps(result_data, indent=2, ensure_ascii=False)}")
                except (TypeError, ValueError) as e:
                    logger.debug(f"Could not format result data as JSON: {e}")
                    logger.debug(f"Result data (raw): {result_data}")
            elif result_data:
                logger.debug(f"Result data (non-dict): {result_data}")
            
            # Check if MCP returned empty/no results
            if not result_data or (isinstance(result_data, dict) and not result_data.get('content')):
                logger.info(f"MCP returned no results for {tool_name} query")
                no_results_response = {
                    "tool": tool_name,
                    "arguments": arguments,
                    "result": f"I don't have any specific information about {prompt.lower()} in Yubi's current project portfolio. This might mean Yubi hasn't worked on projects in this area, or the information isn't available in the database."
                }
                logger.debug(f"No results response:\n{json.dumps(no_results_response, indent=2, ensure_ascii=False)}")
                return no_results_response

            # Summarize for the user
            summary = summarize(mcp_response, prompt)
            logger.info("Request processed successfully")
            
            # Log final response being returned to user
            final_response = {"tool": tool_name, "arguments": arguments, "result": summary}
            logger.debug(f"Final response to user:\n{json.dumps(final_response, indent=2, ensure_ascii=False)}")
            
            return final_response

        fallback_response = {"result": "Please enter a prompt or use a supported input shape."}
        logger.debug(f"Fallback response:\n{json.dumps(fallback_response, indent=2, ensure_ascii=False)}")
        return fallback_response

    return await run_in_threadpool(send_request)


if __name__ == "__main__":
    # Run with: python3 main.py
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)
