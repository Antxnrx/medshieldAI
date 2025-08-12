// scripts/content.js
// MedShield content script: build UI, call backend, highlight safely

(async function () {
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'triggerScan') {
      // Trigger a new scan
      scanPage();
      sendResponse({ success: true });
      return true; // Required for async sendResponse
    }
    // Always return true for async response
    return true;
  });
  console.log("🛡️ MedShield AI (Gemini) content script loaded.");

  // -------- CSS (inline so no missing-file issues) --------
  const SIDEBAR_CSS = `
/* General Sidebar Styles */
#medshield-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    width: 360px;
    height: 100%;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    transition: background-color 0.3s, color 0.3s;
}

/* Light Theme (Default) */
#medshield-sidebar {
    background-color: #f9f9f9;
    color: #333;
    border-left: 1px solid #e0e0e0;
    box-shadow: -2px 0 15px rgba(0,0,0,0.1);
}

/* Header */
.ms-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
}
.ms-header-title {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
}
.ms-header-title .ms-icon {
    margin-right: 8px;
    font-size: 20px;
}
.ms-close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #888;
}

/* Content Area */
.ms-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
}

/* Claim Card */
.ms-card {
    background-color: #ffffff;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid #e0e0e0;
}
.ms-card h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #555;
    font-weight: 600;
}
.ms-card p {
    margin: 0 0 16px 0;
    line-height: 1.5;
}
.ms-verdict {
    font-weight: 700;
    font-size: 18px;
}
.ms-verdict.misinformation { color: #d93025; }
.ms-verdict.true { color: #1e8e3e; }
.ms-verdict.unclear { color: #f29900; }

/* Danger Meter */
.ms-danger-meter {
    height: 8px;
    width: 100%;
    background-color: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin-top: 4px;
}
.ms-danger-level {
    height: 100%;
    border-radius: 4px;
}
.ms-danger-level.low { background-color: #1e8e3e; width: 25%; }
.ms-danger-level.moderate { background-color: #f29900; width: 50%; }
.ms-danger-level.high { background-color: #d93025; width: 75%; }
.ms-danger-level.critical { background-color: #a50e0e; width: 100%; }

/* Sources */
.ms-source-link {
    display: block;
    background-color: #f1f3f4;
    padding: 10px;
    border-radius: 6px;
    margin-top: 8px;
    text-decoration: none;
    color: #333;
    font-weight: 500;
    word-wrap: break-word;
}
.ms-source-link:hover {
    background-color: #e8eaed;
}

/* ------------------- */
/* --- Dark Theme --- */
/* ------------------- */
body.dark-theme #medshield-sidebar {
    background-color: #121212;
    color: #e0e0e0;
    border-left: 1px solid #333;
    box-shadow: -2px 0 15px rgba(0,0,0,0.5);
}
body.dark-theme .ms-header {
    border-bottom: 1px solid #333;
}
body.dark-theme .ms-close-btn {
    color: #bbb;
}
body.dark-theme .ms-card {
    background-color: #1e1e1e;
    border: 1px solid #444;
}
body.dark-theme .ms-card h3 {
    color: #aaa;
}
body.dark-theme .ms-source-link {
    background-color: #2c2c2c;
    color: #e0e0e0;
}
body.dark-theme .ms-source-link:hover {
    background-color: #383838;
}
body.dark-theme .ms-danger-meter {
    background-color: #444;
}
`;


  // -------- Utility: inject css string into page --------
  function injectCSS(cssText) {
    try {
      const style = document.createElement("style");
      style.setAttribute("data-medshield", "1");
      style.textContent = cssText;
      (document.head || document.documentElement).appendChild(style);
      return true;
    } catch (e) {
      console.warn("MedShield: failed to inject CSS", e);
      return false;
    }
  }

  // -------- Utility: escape regex special chars --------
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
  }

  // -------- Safe text-highlighter using TreeWalker (only text nodes) --------
  function highlightTextInPage(needle) {
    try {
      if (!needle || typeof needle !== "string") return;
      const trimmed = needle.trim();
      if (trimmed.length < 4 || trimmed.length > 200) return; // avoid tiny or huge patterns

      const regex = new RegExp(escapeRegExp(trimmed), "gi");

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName.toLowerCase();
            // skip interactive or script/style elements
            if (["script", "style", "textarea", "input", "iframe", "noscript", "svg"].includes(tag)) return NodeFilter.FILTER_REJECT;
            if (parent.closest && parent.closest("#medshield-sidebar")) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      for (const node of nodes) {
        const text = node.nodeValue;
        if (!regex.test(text)) continue;
        const frag = document.createDocumentFragment();
        let lastIndex = 0;
        regex.lastIndex = 0;
        let m;
        while ((m = regex.exec(text)) !== null) {
          const idx = m.index;
          if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
          const mark = document.createElement("mark");
          mark.style.background = "yellow";
          mark.style.padding = "0 2px";
          mark.textContent = m[0];
          frag.appendChild(mark);
          lastIndex = regex.lastIndex;
          if (m.index === regex.lastIndex) regex.lastIndex++;
        }
        if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
        try { node.parentNode.replaceChild(frag, node); } catch (e) { /* ignore replace errors */ }
      }
    } catch (e) {
      console.warn("MedShield: highlight error", e);
    }
  }

// -------- Build and show sidebar UI (programmatically) --------
function showSidebar(results = []) {
    // --- 1. REMOVE a lot of old code ---
    // You can delete almost all the code that was creating elements one by one.

    try {
        // Remove existing sidebar if any
        const old = document.getElementById("medshield-sidebar");
        if (old) old.remove();

        // Create container
        const sidebar = document.createElement("div");
        sidebar.id = "medshield-sidebar";

        // --- 2. GENERATE the HTML for the claim cards ---
        let cardsHTML = '';
        if (!Array.isArray(results) || results.length === 0) {
            cardsHTML = `<div class="ms-card"><p>No health misinformation detected ✅</p></div>`;
        } else {
            cardsHTML = results.map(r => {
                const dangerClass = (r.danger || 'low').toLowerCase();
                const verdictClass = (r.verdict || 'unclear').toLowerCase();
                const sourcesHTML = (r.sources || [])
                    .map(s => `<a href="${s}" target="_blank" class="ms-source-link">${s}</a>`)
                    .join('');

                return `
                    <div class="ms-card">
                        <h3>Claim</h3>
                        <p>${r.claim || '—'}</p>

                        <h3>Verdict</h3>
                        <p class="ms-verdict ${verdictClass}">${r.verdict || 'UNCLEAR'}</p>

                        <h3>Explanation</h3>
                        <p>${r.explanation || 'No explanation provided.'}</p>

                        <h3>Danger Level</h3>
                        <div class="ms-danger-meter">
                            <div class="ms-danger-level ${dangerClass}"></div>
                        </div>

                        <h3>Sources</h3>
                        ${sourcesHTML}
                    </div>
                `;
            }).join('');
        }

        // --- 3. ASSEMBLE the final sidebar HTML ---
        const sidebarHTML = `
            <div class="ms-header">
                <span class="ms-header-title"><span class="ms-icon">🛡️</span>MedShield AI</span>
                <button class="ms-close-btn">&times;</button>
            </div>
            <div class="ms-content">
                ${cardsHTML}
            </div>
        `;
        sidebar.innerHTML = sidebarHTML;

        // --- 4. APPEND to page and add event listeners ---
        document.documentElement.appendChild(sidebar);

        // Add close functionality
        sidebar.querySelector('.ms-close-btn').onclick = () => sidebar.remove();

        return sidebar;
    } catch (err) {
        console.error("MedShield: showSidebar error", err);
        return null;
    }
}

  // -------- Get page text safely (limit length) --------
  function getPageText() {
    const title = document.title || "";
    const meta = (document.querySelector("meta[name='description']")?.content) || "";
    const body = document.body ? document.body.innerText : "";
    return (title + "\n" + meta + "\n" + body).slice(0, 50000);
  }

  // Function to scan the page and display results
  function scanPage() {
    try {
      // inject CSS if not already injected
      injectCSS(SIDEBAR_CSS);

      const text = getPageText();
      const url = window.location.href;

      // Show loading indicator
      const loadingSidebar = showSidebar([{ 
        claim: "Analyzing page content...", 
        verdict: "ANALYZING", 
        explanation: "Please wait while MedShield AI analyzes the health information on this page.",
        danger: "Low"
      }]);

      // Use message passing to communicate with background script
      chrome.runtime.sendMessage(
        { 
          action: 'scanText', 
          text, 
          url 
        },
        response => {
          if (!response || !response.success) {
            console.error("MedShield backend error:", response?.error || "Unknown error");
            let errorMessage = "Could not connect to MedShield backend. Please ensure the backend server is running at http://localhost:5001.";
            let errorVerdict = "ERROR";
            
            if (response?.error === 'invalid_api_key') {
              errorMessage = "The Gemini API key is not configured. Please set a valid API key in the backend's .env file.";
              errorVerdict = "CONFIGURATION ERROR";
            }
            
            showSidebar([{ 
              claim: "Connection Error", 
              verdict: errorVerdict, 
              explanation: `${errorMessage} Error: ${response?.error || "Unknown error"}.`,
              danger: "Low"
            }]);
            return;
          }

          const payload = response.data;
          console.log("MedShield Scan Results:", payload);

          const results = Array.isArray(payload?.results) ? payload.results : [];

          // show sidebar with results
          showSidebar(results);

          // highlight only misinformation claims
          for (const r of results) {
            if (r && r.verdict && String(r.verdict).toUpperCase() === "MISINFORMATION") {
              highlightTextInPage(r.claim || "");
            }
          }
        }
      );
    } catch (err) {
      console.error("MedShield: error calling backend or rendering", err);
      showSidebar([{ 
        claim: "Error", 
        verdict: "ERROR", 
        explanation: `An error occurred: ${err.message}`,
        danger: "Low"
      }]);
    }
  }
  
  // -------- Call backend via background script and render --------
  try {
    // Initial scan when content script loads
    scanPage();
  } catch (err) {
    console.error("MedShield: initial scan error", err);
  }

})();
