function extractYouTubeId(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (host.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/").filter(Boolean)[1] || "";
      }
      return parsed.searchParams.get("v") || "";
    }
  } catch {
    return "";
  }
  return "";
}

export function getYouTubeVideoId(url = "") {
  const id = extractYouTubeId(url);
  return /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : "";
}
