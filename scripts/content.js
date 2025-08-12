// scripts/content.js
// MedShield content script: build UI, call backend, highlight safely

(async function () {
  console.log("🛡️ MedShield AI (Gemini) content script loaded.");

  // -------- CSS (inline so no missing-file issues) --------
  const SIDEBAR_CSS = `
#medshield-sidebar { position: fixed; top: 0; right: 0; width: 360px; height: 100%; background: #fff; border-left: 2px solid #ddd; box-shadow: -4px 0 20px rgba(0,0,0,0.15); z-index: 2147483647; font-family: Arial, sans-serif; display:flex; flex-direction:column; }
#medshield-header { background:#007bff; color:#fff; padding:12px; font-weight:700; display:flex; justify-content:space-between; align-items:center; }
#medshield-content { padding:12px; overflow:auto; flex:1; }
.ms-claim { border-bottom:1px solid #eee; padding:8px 0; }
.ms-claim .ms-sources a { color:#007bff; text-decoration:underline; display:block; margin-top:6px; }
.ms-controls { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
.ms-controls button { background:#007bff; color:#fff; border:none; padding:6px 8px; border-radius:6px; cursor:pointer; font-size:13px; }
.ms-danger { color:#b22222; font-weight:700; }
.ms-true { color:#1a7f37; font-weight:700; }
.ms-unclear { color:#a67c00; font-weight:700; }
#medshield-footer { padding:8px; border-top:1px solid #eee; font-size:12px; color:#555; text-align:center; }
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
    try {
      // remove existing if any
      const old = document.getElementById("medshield-sidebar");
      if (old) old.remove();

      // container
      const sidebar = document.createElement("div");
      sidebar.id = "medshield-sidebar";

      // header
      const header = document.createElement("div");
      header.id = "medshield-header";
      header.innerHTML = `<span>🛡️ MedShield AI</span>`;
      // close button
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.style.background = "transparent";
      closeBtn.style.color = "#fff";
      closeBtn.style.border = "none";
      closeBtn.style.cursor = "pointer";
      closeBtn.onclick = () => sidebar.remove();
      header.appendChild(closeBtn);
      sidebar.appendChild(header);

      // content
      const content = document.createElement("div");
      content.id = "medshield-content";

      if (!Array.isArray(results) || results.length === 0) {
        const p = document.createElement("p");
        p.textContent = "No health misinformation detected ✅";
        content.appendChild(p);
      } else {
        // summary / controls
        const summary = document.createElement("div");
        summary.className = "ms-summary";
        const total = results.length;
        const highCount = results.filter(r => String(r.danger).toLowerCase() === "critical" || String(r.danger).toLowerCase() === "high").length;
        summary.innerHTML = `<div><strong>Detected:</strong> ${total} claims — <span class="ms-danger">${highCount} high/critical</span></div>`;
        content.appendChild(summary);

        // controls row
        const controls = document.createElement("div");
        controls.className = "ms-controls";
        const loginBtn = document.createElement("button"); loginBtn.textContent = "Sign in (Google)"; loginBtn.onclick = () => alert("Google Sign-in placeholder");
        const historyBtn = document.createElement("button"); historyBtn.textContent = "History"; historyBtn.onclick = () => alert("History placeholder");
        const copyAllBtn = document.createElement("button"); copyAllBtn.textContent = "Copy all sources"; copyAllBtn.onclick = () => {
          const allSources = (results.flatMap(r => r.sources || [])).join("\n");
          navigator.clipboard.writeText(allSources).then(()=> alert("Sources copied"));
        };
        controls.appendChild(loginBtn); controls.appendChild(historyBtn); controls.appendChild(copyAllBtn);
        content.appendChild(controls);

        // per-claim cards (safe DOM creation)
        for (const r of results) {
          const card = document.createElement("div");
          card.className = "ms-claim";

          const claimNode = document.createElement("div");
          claimNode.innerHTML = `<strong>Claim:</strong> `;
          const claimText = document.createElement("span");
          claimText.textContent = r.claim || "—";
          claimNode.appendChild(claimText);
          card.appendChild(claimNode);

          const verdictNode = document.createElement("div");
          verdictNode.innerHTML = `<strong>Verdict:</strong> `;
          const vSpan = document.createElement("span");
          vSpan.textContent = (r.verdict || "—");
          vSpan.className = r.verdict ? `ms-${String(r.verdict).toLowerCase()}` : "";
          verdictNode.appendChild(vSpan);
          card.appendChild(verdictNode);

          if (r.explanation) {
            const expl = document.createElement("div");
            expl.innerHTML = `<strong>Why:</strong> `;
            const t = document.createElement("span"); t.textContent = r.explanation; expl.appendChild(t);
            card.appendChild(expl);
          }

          if (r.danger) {
            const danger = document.createElement("div");
            danger.innerHTML = `<strong>Danger:</strong> <span class="ms-danger">${r.danger}</span>`;
            card.appendChild(danger);
          }

          // sources
          if (Array.isArray(r.sources) && r.sources.length) {
            const sourcesWrap = document.createElement("div");
            sourcesWrap.className = "ms-sources";
            const label = document.createElement("div"); label.textContent = "Sources:";
            sourcesWrap.appendChild(label);
            for (const s of r.sources) {
              try {
                const a = document.createElement("a");
                a.href = s;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.textContent = s;
                sourcesWrap.appendChild(a);
              } catch (e) {
                // invalid URL, skip
              }
            }
            card.appendChild(sourcesWrap);
          }

          // small action buttons
          const bwrap = document.createElement("div");
          bwrap.style.marginTop = "8px";
          const copyBtn = document.createElement("button"); copyBtn.textContent = "Copy sources";
          copyBtn.onclick = async () => {
            try {
              await navigator.clipboard.writeText((r.sources || []).join("\n"));
              copyBtn.textContent = "Copied!";
              setTimeout(()=> copyBtn.textContent = "Copy sources", 1200);
            } catch (e) { alert("Cannot copy"); }
          };
          const shareBtn = document.createElement("button"); shareBtn.textContent = "Share";
          shareBtn.onclick = async () => {
            const payload = `${r.claim} — ${r.verdict}\n${r.explanation || ""}\n${(r.sources || []).join("\n")}`;
            if (navigator.share) {
              try { await navigator.share({ title: "MedShield AI - Claim", text: payload }); } catch(e) { await navigator.clipboard.writeText(payload); alert("Shared to clipboard"); }
            } else { await navigator.clipboard.writeText(payload); alert("Copied claim to clipboard"); }
          };
          const reportBtn = document.createElement("button"); reportBtn.textContent = "Reverify / Report";
          reportBtn.onclick = () => alert("Report submitted (placeholder). Developers will review.");

          bwrap.appendChild(copyBtn); bwrap.appendChild(shareBtn); bwrap.appendChild(reportBtn);
          card.appendChild(bwrap);

          content.appendChild(card);
        }
      }

      sidebar.appendChild(content);

      // footer
      const footer = document.createElement("div");
      footer.id = "medshield-footer";
      footer.textContent = "MedShield AI — Trusted sources: WHO / CDC / PubMed";
      sidebar.appendChild(footer);

      // append
      document.documentElement.appendChild(sidebar);
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

  // -------- Call backend (with timeout) and render --------
  try {
    // inject CSS
    injectCSS(SIDEBAR_CSS);

    const text = getPageText();
    const url = window.location.href;

    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 15000);

    const resp = await fetch("http://localhost:5000/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, url }),
      signal: controller.signal
    });

    clearTimeout(tId);

    if (!resp.ok) {
      console.error("MedShield backend HTTP error", resp.status, resp.statusText);
      return;
    }

    const payload = await resp.json();
    console.log("MedShield Scan Results:", payload);

    const results = Array.isArray(payload?.results) ? payload.results : [];

    // show sidebar
    showSidebar(results);

    // highlight only misinformation claims
    for (const r of results) {
      if (r && r.verdict && String(r.verdict).toUpperCase() === "MISINFORMATION") {
        highlightTextInPage(r.claim || "");
      }
    }
  } catch (err) {
    console.error("MedShield: error calling backend or rendering", err);
  }

})();
