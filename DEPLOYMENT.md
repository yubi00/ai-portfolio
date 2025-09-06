# AI Portfolio Deployment Guide

This guide walks you through deploying your AI Portfolio application to Render using Blueprint YAML configuration.

## 🏗️ Architecture

The application consists of three services:

1. **MCP Server** (`ai-portfolio-mcp-server`) - Provides GitHub portfolio data
2. **Backend** (`ai-portfolio-backend`) - FastAPI service that processes user queries  
3. **Frontend** (`ai-portfolio-frontend`) - React/Vite static site

## 📋 Prerequisites

1. **Render CLI** installed and authenticated:
   ```bash
   npm install -g @render/cli
   render auth login
   ```

2. **Environment Variables** ready:
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `GITHUB_TOKEN` - Your GitHub personal access token

3. **Git Repository** - Your code should be in a Git repository (GitHub, GitLab, etc.)

## 🚀 Deployment Methods

### Method 1: Manual Deployment via Render Dashboard (Recommended)

1. **Prepare your repository**:
   ```bash
   # Run validation script first
   ./scripts/validate-config.sh
   
   # Commit and push your changes
   git add .
   git commit -m "Add Render deployment configuration"
   git push origin main
   ```

2. **Deploy via Render Dashboard**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your Git repository (GitHub, GitLab, etc.)
   - Render will automatically detect your `render.yaml` file
   - Review the services and click "Apply"

### Method 2: Using the Deployment Script (Validation Only)

```bash
# Make sure you're in the project root
cd /path/to/ai-portfolio

# Run the deployment script (provides instructions)
./scripts/deploy.sh
```

The script will:
- ✅ Check if Render CLI is installed
- ✅ Validate the render.yaml configuration  
- ✅ Check for required environment variables
- 📋 Provide manual deployment instructions

> **Note**: Current Render CLI versions don't support blueprint deployment directly. Manual deployment through the dashboard is the recommended approach.

## 🔧 Configuration Details

### Service URLs and Dependencies

The services are configured with automatic URL resolution:

- **MCP Server** → Available at `https://ai-portfolio-mcp-server.onrender.com`
- **Backend** → Available at `https://ai-portfolio-backend.onrender.com`
  - Automatically connects to MCP Server via `MCP_SERVER_URL` env var
  - Allows CORS from Frontend via `FRONTEND_URL` env var
- **Frontend** → Available at `https://ai-portfolio-frontend.onrender.com`
  - Automatically connects to Backend via `VITE_API_URL` env var

### Environment Variables

#### MCP Server Service
- `GITHUB_TOKEN` - Your GitHub personal access token (set manually)
- `PORT` - Automatically set to 8000

#### Backend Service  
- `OPENAI_API_KEY` - Your OpenAI API key (set manually)
- `MCP_SERVER_URL` - Automatically set from MCP Server service URL
- `FRONTEND_URL` - Automatically set from Frontend service URL
- `PORT` - Automatically set to 9000

#### Frontend Service
- `VITE_API_URL` - Automatically set from Backend service URL

## 📝 Post-Deployment Steps

1. **Set Environment Variables**:
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Navigate to each service
   - Set the required environment variables:
     - `OPENAI_API_KEY` for the backend service
     - `GITHUB_TOKEN` for the MCP server service

2. **Monitor Deployment**:
   - Watch the build logs in the Render dashboard
   - Wait for all services to show "Live" status
   - Check health endpoints:
     - MCP Server: `https://your-mcp-server-url.onrender.com/`
     - Backend: `https://your-backend-url.onrender.com/`

3. **Test the Application**:
   - Visit your frontend URL
   - Try asking questions about your portfolio
   - Verify the terminal interface works correctly

## 🔍 Troubleshooting

### Common Issues

1. **Build Failures**:
   - Check that `requirements.txt` includes all Python dependencies
   - Verify `package.json` has correct Node.js dependencies
   - Review build logs in Render dashboard

2. **Environment Variable Issues**:
   - Ensure `OPENAI_API_KEY` and `GITHUB_TOKEN` are set correctly
   - Check that service-to-service URLs are resolving properly

3. **CORS Errors**:
   - Verify that `FRONTEND_URL` is correctly set in backend service
   - Check browser console for specific CORS error messages

4. **MCP Connection Issues**:
   - Ensure MCP Server is healthy and responding
   - Check that `MCP_SERVER_URL` points to the correct service
   - Review backend logs for connection errors

### Useful Commands

```bash
# Check deployment status
render services list

# View service logs
render logs --service ai-portfolio-backend --tail

# Update environment variables
render env set OPENAI_API_KEY=your_key --service ai-portfolio-backend

# Redeploy a specific service
render deploy --service ai-portfolio-backend
```

## 🔄 Updates and Redeployment

To update your application:

1. **Push changes** to your Git repository
2. **Automatic redeployment** will trigger (if enabled)
3. **Manual redeployment**:
   ```bash
   render deploy --service ai-portfolio-backend
   render deploy --service ai-portfolio-mcp-server
   render deploy --service ai-portfolio-frontend
   ```

## 📊 Monitoring

- **Render Dashboard**: Monitor service health, logs, and metrics
- **Health Checks**: All services have health check endpoints configured
- **Logs**: Access real-time logs through Render dashboard or CLI

## 💰 Cost Considerations

- **Starter Plan**: All services configured for Render's starter plan
- **Free Tier**: Render offers free tier with limitations (services sleep after inactivity)
- **Upgrade**: Consider upgrading to paid plans for production use

## 🔒 Security Notes

- Environment variables are encrypted at rest
- HTTPS is automatically provided by Render
- CORS is properly configured between services
- Secrets should never be committed to Git

---

For more information, visit the [Render Documentation](https://render.com/docs).
