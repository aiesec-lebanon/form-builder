/*!
 * AIESEC Forms embed. Usage:
 *   <div data-aiesec-form="your-form-link"></div>
 *   <script src="https://<forms-domain>/embed.js" async></script>
 * Optional attributes: data-theme="light|dark", data-transparent, data-title.
 * Fires an "aiesec-forms:submitted" event on the div after a response is sent.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script || !script.src) return;
  var origin = new URL(script.src).origin;
  var frames = [];

  function mount(container) {
    if (container.getAttribute("data-aiesec-form-mounted")) return;
    var slug = container.getAttribute("data-aiesec-form") || "";
    if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) return;
    container.setAttribute("data-aiesec-form-mounted", "1");

    var params = new URLSearchParams();
    var theme = container.getAttribute("data-theme");
    if (theme === "light" || theme === "dark") params.set("theme", theme);
    if (container.hasAttribute("data-transparent")) params.set("transparent", "1");
    var query = params.toString();

    var iframe = document.createElement("iframe");
    iframe.src = origin + "/embed/" + slug + (query ? "?" + query : "");
    iframe.title = container.getAttribute("data-title") || "Form";
    iframe.loading = "lazy";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.cssText = "display:block;width:100%;height:640px;min-height:240px;border:0;background:transparent;";
    container.appendChild(iframe);
    frames.push({ iframe: iframe, container: container });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== origin) return;
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (event.source !== frame.iframe.contentWindow) continue;
      var data = event.data || {};
      if (data.type === "aiesec-forms:resize" && typeof data.height === "number" && isFinite(data.height)) {
        frame.iframe.style.height = Math.max(240, Math.min(Math.round(data.height), 20000)) + "px";
      } else if (data.type === "aiesec-forms:submitted") {
        frame.container.dispatchEvent(new CustomEvent("aiesec-forms:submitted", { bubbles: true }));
      }
    }
  });

  function scan() {
    var nodes = document.querySelectorAll("[data-aiesec-form]");
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scan);
  else scan();
})();
