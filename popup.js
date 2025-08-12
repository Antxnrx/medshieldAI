// MedShield AI Popup Script

document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const outputDiv = document.getElementById('output');
  const scanButton = document.getElementById('scanButton');

  // Check backend status when popup opens
  checkBackendStatus();

  // Add click event listener to scan button
  scanButton.addEventListener('click', function() {
    // Get the current active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0]) {
        const activeTab = tabs[0];
        
        // Send message to content script to trigger scan
        chrome.tabs.sendMessage(activeTab.id, {action: 'triggerScan'}, function(response) {
          if (chrome.runtime.lastError) {
            outputDiv.innerHTML = '<div class="status error">Error: Could not communicate with content script.</div>';
          } else if (response && response.success) {
            outputDiv.innerHTML = '<div class="status active">Scan initiated successfully!</div>';
          } else {
            outputDiv.innerHTML = '<div class="status error">Error: ' + (response?.error || 'Unknown error') + '</div>';
          }
        });
      } else {
        outputDiv.innerHTML = '<div class="status error">Error: No active tab found.</div>';
      }
    });
  });

  // Function to check backend status
  function checkBackendStatus() {
    chrome.runtime.sendMessage({action: 'checkBackendStatus'}, function(response) {
      if (chrome.runtime.lastError) {
        statusDiv.className = 'status error';
        statusDiv.textContent = 'Backend status: Error communicating with background script';
        return;
      }
      
      if (response && response.success) {
        statusDiv.className = 'status active';
        statusDiv.textContent = 'Backend status: Running';
      } else {
        statusDiv.className = 'status error';
        statusDiv.textContent = 'Backend status: Not available. ' + (response?.error || '');
      }
    });
  }
});