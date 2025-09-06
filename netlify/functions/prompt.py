import json
import os
import uuid
import requests
from typing import Dict

# Simple session storage (in production, use a database)
SESSIONS: Dict[str, Dict] = {}

def handler(event, context):
    """Netlify serverless function for handling prompts"""
    
    # Handle CORS
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    }
    
    # Handle preflight requests
    if event['httpMethod'] == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': ''
        }
    
    if event['httpMethod'] != 'POST':
        return {
            'statusCode': 405,
            'headers': headers,
            'body': json.dumps({'error': 'Method not allowed'})
        }
    
    try:
        # Parse request body
        body = json.loads(event['body'])
        prompt = body.get('prompt', '')
        session_id = body.get('session_id', str(uuid.uuid4())[:8])
        
        if not prompt:
            return {
                'statusCode': 400,
                'headers': headers,
                'body': json.dumps({'error': 'No prompt provided'})
            }
        
        # Initialize session
        if session_id not in SESSIONS:
            SESSIONS[session_id] = {"history": [], "last_response": ""}
        
        session = SESSIONS[session_id]
        
        # For now, let's create a simple response
        # Later we can integrate with the MCP server
        reply = f"Hello! I received your message: '{prompt}'. This is running on Netlify serverless functions!"
        
        # Update session
        session["history"].append({"user": prompt, "assistant": reply})
        session["last_response"] = reply
        
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps({
                'reply': reply,
                'session_id': session_id,
                'source': 'netlify_serverless'
            })
        }
        
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': headers,
            'body': json.dumps({
                'error': f'Server error: {str(e)}',
                'source': 'netlify_error'
            })
        }
