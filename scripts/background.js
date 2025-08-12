// background.js - MediShield AI service worker

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle text scanning requests from content script
  if (message.action === 'scanText') {
    // Forward the request to the backend
    fetch('http://localhost:5001/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.text, url: message.url })
    })
    .then(async response => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.error === 'invalid_api_key') {
          throw new Error(`API key not configured: ${errorData.message}`);
        } else {
          throw new Error(`HTTP error ${response.status}`);
        }
      }
      return response.json();
    })
    .then(data => {
      sendResponse({ success: true, data });
    })
    .catch(error => {
      console.error('MediShield backend error:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // Handle backend status check requests from popup
  if (message.action === 'checkBackendStatus') {
    fetch('http://localhost:5001/scan', {
      method: 'HEAD'
    })
    .then(response => {
      sendResponse({ success: true });
    })
    .catch(error => {
      console.error('MediShield backend status check error:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// When a tab is updated, inject the content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
    console.log(`🛡️ MediShield AI monitoring tab: ${tab.url}`);
  }
});

// Log when the service worker is installed
chrome.runtime.onInstalled.addListener(() => {
  console.log('🛡️ MediShield AI extension installed');
});