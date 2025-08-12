# MediShield AI Chrome Extension

A Chrome extension that flags health misinformation and provides trusted alternatives using AI.

## Features

- Scans web pages for health-related misinformation
- Highlights potentially misleading claims
- Provides explanations and trusted sources
- Shows danger level for each claim

## Setup

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd medshield_backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   PORT=5000
   ```

4. Start the backend server:
   ```
   npm start
   ```

### Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top-right corner)
3. Click "Load unpacked" and select the MediShield_AI directory
4. The extension should now be installed and visible in your toolbar

## Usage

1. Browse to any webpage with health-related content
2. The extension will automatically scan the page for health misinformation
3. A sidebar will appear if any potential misinformation is detected
4. Click on the extension icon to check backend status or manually trigger a scan

### Testing with Demo Page

1. Start a local server: `python3 -m http.server 8080`
2. Open http://localhost:8080/demo.html in your browser
3. The extension should automatically scan the demo page and display results

## Architecture

- **Frontend**: Chrome extension with content script, background script, and popup UI
- **Backend**: Node.js server using Express that processes text with Gemini AI
- **Communication**: Background script handles API calls to prevent CORS issues

## Security Notes

- Never commit your `.env` file with real API keys
- The extension only processes health-related content
- All data is processed locally and through your own API key