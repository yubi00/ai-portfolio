#!/bin/bash

# Configuration Validation Script
# Validates the render.yaml and project setup before deployment

set -e

echo "🔍 AI Portfolio Configuration Validation"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo "❌ render.yaml not found. Please run this script from the project root."
    exit 1
fi

if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found."
    exit 1
fi

if [ ! -f "client/package.json" ]; then
    echo "❌ client/package.json not found."
    exit 1
fi

echo "✅ Basic project structure looks good"

# Validate Python dependencies
echo ""
echo "🐍 Python Dependencies:"
echo "======================="
required_deps=("fastapi" "uvicorn" "openai" "requests" "python-dotenv" "mcp")
missing_deps=()

for dep in "${required_deps[@]}"; do
    if grep -q "^$dep" requirements.txt; then
        echo "✅ $dep"
    else
        echo "❌ $dep (missing)"
        missing_deps+=("$dep")
    fi
done

if [ ${#missing_deps[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Missing Python dependencies. Please add to requirements.txt:"
    for dep in "${missing_deps[@]}"; do
        echo "   $dep"
    done
fi

# Validate Node.js dependencies
echo ""
echo "📦 Node.js Dependencies:"
echo "======================="
cd client
required_node_deps=("react" "react-dom" "vite" "typescript")
missing_node_deps=()

for dep in "${required_node_deps[@]}"; do
    if grep -q "\"$dep\"" package.json; then
        echo "✅ $dep"
    else
        echo "❌ $dep (missing)"
        missing_node_deps+=("$dep")
    fi
done

if [ ${#missing_node_deps[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  Missing Node.js dependencies. Please add to client/package.json:"
    for dep in "${missing_node_deps[@]}"; do
        echo "   $dep"
    done
fi

cd ..

# Validate render.yaml structure
echo ""
echo "📋 Render Configuration:"
echo "======================="

services_count=$(grep -c "^  - type: web" render.yaml || echo "0")
echo "✅ Found $services_count web services"

# MCP Server service not needed (using existing deployed server)
echo "✅ MCP Server service not needed (using existing deployment)"

if grep -q "ai-portfolio-backend" render.yaml; then
    echo "✅ Backend service configured"
else
    echo "❌ Backend service missing"
fi

if grep -q "ai-portfolio-frontend" render.yaml; then
    echo "✅ Frontend service configured"
else
    echo "❌ Frontend service missing"
fi

# Check for required environment variables in render.yaml
echo ""
echo "🔐 Environment Variables:"
echo "========================"

if grep -q "OPENAI_API_KEY" render.yaml; then
    echo "✅ OPENAI_API_KEY configured"
else
    echo "❌ OPENAI_API_KEY missing"
fi

# GITHUB_TOKEN not needed since we're using existing MCP server
echo "✅ GITHUB_TOKEN not needed (using existing MCP server)"

if grep -q "MCP_SERVER_URL" render.yaml; then
    echo "✅ MCP_SERVER_URL configured"
else
    echo "❌ MCP_SERVER_URL missing"
fi

# Check file paths
echo ""
echo "📁 File Paths:"
echo "============="

# MCP Server files not needed (using existing deployment)
echo "✅ MCP Server files not needed (using existing deployment)"

if [ -f "mcp-client/main.py" ]; then
    echo "✅ Backend entry point exists"
else
    echo "❌ mcp-client/main.py not found"
fi

if [ -d "client/src" ]; then
    echo "✅ Frontend source directory exists"
else
    echo "❌ client/src not found"
fi

echo ""
echo "🎯 Validation Complete!"
echo ""

if [ ${#missing_deps[@]} -eq 0 ] && [ ${#missing_node_deps[@]} -eq 0 ]; then
    echo "✅ Configuration looks good! Ready for deployment."
    echo ""
    echo "Next steps:"
    echo "1. Commit your changes to Git"
    echo "2. Run: ./scripts/deploy.sh"
    echo "3. Set environment variables in Render dashboard"
else
    echo "⚠️  Please fix the issues above before deploying."
fi
