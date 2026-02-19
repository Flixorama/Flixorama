document.querySelectorAll(".menu-item").forEach(a => {
  const route = a.getAttribute("data-route");
  if (!route) return;

  const isActive =
    (route === "home" && location.pathname.includes("home")) ||
    (route === "movies" && location.pathname.includes("movies")) ||
    (route === "series" && location.pathname.includes("series")) ||
    (route === "animes" && location.pathname.includes("animes")) ||
    (route === "info" && location.pathname.includes("info"));

  if (isActive) a.classList.add("active");
});
