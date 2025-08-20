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

    system = (
        "You are a router. Given a natural language prompt and a catalog of MCP tools, "
        "choose exactly ONE tool and produce ONLY a compact JSON object with fields:\n"
        "{ \"name\": <tool_name>, \"arguments\": { ... } }.\n"
        "Arguments MUST conform to the tool's JSON Schema (types and required fields). "
        "If the user asks about a specific project or repository, use the get_repository tool with the correct repo name (never use the word 'project' as a repo name unless the user explicitly says so). "
        "If the user asks about a project and does not specify the owner, use the GitHub username 'yubi00' as the owner. "
        "If the repo name is not clear or the user asks about a project by keyword, use the search_repositories tool with the project name as the 'q' argument. "
        "If the user asks about Yubi's skills, technologies, or frameworks, use the list_repositories tool to get all repositories, then summarize the most common languages, frameworks, and tools found as Yubi's skills. "
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
    # If the tool requires an 'owner' argument and it's missing, hardcode to 'yubi00'
    if name and any(
        t.get("name") == name and "owner" in (t.get("inputSchema", {}).get("properties", {}))
        for t in tools
    ):
        if "owner" not in arguments or not arguments["owner"]:
            arguments["owner"] = "yubi00"
    if not name:
        raise ValueError("Router did not return a tool name.")
    return name, arguments

def _light_validate(tools: List[Dict[str, Any]], name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """
    Very light validation: check tool exists, required properties present, and types basic check.
    (Keeps deps minimal; swap for jsonschema if you want strict validation.)
    """
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
    system_prompt = (
        "You are Yubi's AI portfolio assistant. Given the user's question and the following JSON response from the MCP server, generate a concise, friendly, and informative answer for the user. "
        "If the response contains a list of repositories, list ALL repositories with their names, descriptions, and links (do not summarize or show only highlights). "
        "If the response contains a list of skills or experiences, list ALL skills and experiences in detail (do not summarize or show only highlights). "
        "If the response contains technical details, explain them simply."
    )
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
    print("OpenAI summary:", summary)
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
    print(f"Prompt classification: {label}")
    return label == "relevant"


def _rpc(payload: dict, timeout: int = 120) -> dict:
    """Send a JSON-RPC call to the MCP server (HTTP)."""
    payload.setdefault("jsonrpc", "2.0")
    payload.setdefault("id", str(uuid.uuid4()))
    r = _session.post(MCP_SERVER_URL, json=payload, timeout=timeout)
    r.raise_for_status()
    try:
        data = r.json()
    except Exception as e:
        # Try to parse SSE (data: ...\n) format
        print("MCP server response was not valid JSON. Raw text:", r.text)
        sse_lines = [line for line in r.text.splitlines() if line.startswith("data:")]
        if sse_lines:
            try:
                # Take the first data: line, strip 'data: ' and parse as JSON
                json_str = sse_lines[0][len("data:"):].strip()
                data = json.loads(json_str)
            except Exception as sse_e:
                raise HTTPException(status_code=502, detail=f"MCP server SSE data could not be parsed as JSON. Error: {sse_e}. Raw: {sse_lines[0]}")
        else:
            raise HTTPException(status_code=502, detail=f"MCP server did not return valid JSON. Error: {e}. Raw response: {r.text}")
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
    Accepts:
      1) {"prompt":"..."}  -> routes to best MCP tool, calls it, summarizes result
      2) {"name":"<toolName>", "arguments":{...}} -> directly calls a specific tool
      3) {"method":"tools/call"|"tools/list"|..., "params":{...}} -> passthrough JSON-RPC
    """

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
                return {"result": response.output_text.strip()}

            _ensure_initialized()
            tools = _list_mcp_tools()

            # Ask the model to pick the MCP tool + args
            try:
                tool_name, arguments = _choose_tool_with_llm(prompt, tools)
            except Exception as e:
                return {"error": f"Failed to route prompt: {e}"}

            if tool_name == "__none__":
                return {"result": "I couldn't find a matching GitHub tool for that request. Try asking about repos, a specific repo, or files in a repo."}

            # Validate against schema (light)
            try:
                _light_validate(tools, tool_name, arguments)
            except HTTPException as he:
                return {"error": he.detail}

            # Debug info: print tool call
            print(f"[DEBUG] Calling MCP tool: {tool_name} with arguments: {arguments}")
            # Call MCP
            mcp_response = _rpc({
                "method": "tools/call",
                "params": {
                    "name": tool_name,
                    "arguments": arguments,
                },
            })

            # Summarize for the user
            summary = summarize(mcp_response, prompt)
            return {"tool": tool_name, "arguments": arguments, "result": summary}

        return {"result": "Please enter a prompt or use a supported input shape."}

    return await run_in_threadpool(send_request)


if __name__ == "__main__":
    # Run with: python3 main.py
    uvicorn.run("main:app", host="0.0.0.0", port=9000, reload=True)
