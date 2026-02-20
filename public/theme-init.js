(() => {
  try {
    const theme = localStorage.getItem("dcf-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch {
    // Ignore storage errors to avoid blocking render.
  }
})();
