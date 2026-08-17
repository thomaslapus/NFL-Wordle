// Development mode banner — remove this script tag to disable
(function () {
    const bar = document.createElement("div");
    bar.id = "dev-banner";
    Object.assign(bar.style, {
        position:    "fixed",
        top:         "0",
        left:        "0",
        right:       "0",
        zIndex:      "99999",
        background:  "linear-gradient(135deg,#8b0000,#c0392b)",
        color:       "#fff",
        textAlign:   "center",
        padding:     "10px 16px",
        fontSize:    "0.82rem",
        fontWeight:  "700",
        letterSpacing:"0.5px",
        boxShadow:   "0 2px 12px rgba(0,0,0,0.4)",
        fontFamily:  "system-ui,sans-serif",
    });
    bar.textContent = "🚧  In Development — Updates temporarily unavailable  🚧";
    document.addEventListener("DOMContentLoaded", () => {
        document.body.prepend(bar);
        document.body.style.paddingTop =
            (parseInt(document.body.style.paddingTop || "0") + 40) + "px";
    });
})();
