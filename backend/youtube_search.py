# -*- coding: utf-8 -*-
"""
YouTube Data API search helper.

Returns real, currently-existing video links so the tutors can recommend
*verified* YouTube videos instead of hallucinated URLs. Results are cached
in-memory to stay within the YouTube Data API quota.

Requires a YOUTUBE_API_KEY env var (YouTube Data API v3 key). When the key is
absent the helper returns an empty list and callers fall back to the curated
study_resources.json list.
"""

import html
import os
import time
from threading import Lock
from typing import Any

import requests

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"

_CACHE_TTL_SECONDS = 3600          # 1 hour
_CACHE_MAX_ENTRIES = 256
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_cache_lock = Lock()


def _api_key() -> str:
    """Read the key lazily so it works regardless of import vs .env load order."""
    return os.getenv("YOUTUBE_API_KEY", "").strip()


def youtube_api_available() -> bool:
    """True when a YouTube Data API key is configured."""
    return bool(_api_key())


def search_youtube_videos(query: str, max_results: int = 3) -> list[dict[str, Any]]:
    """Return up to `max_results` verified, embeddable YouTube videos for a query.

    Returns an empty list when no key is set or the API call fails, so callers
    can fall back to curated resources without raising.
    """
    cleaned = (query or "").strip()
    api_key = _api_key()
    if not cleaned or not api_key:
        return []

    limit = max(1, min(int(max_results or 3), 5))
    cache_key = f"{cleaned.lower()}::{limit}"
    now = time.time()
    with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and now - cached[0] < _CACHE_TTL_SECONDS:
            return cached[1]

    try:
        response = requests.get(
            YOUTUBE_SEARCH_URL,
            params={
                "key": api_key,
                "q": cleaned,
                "part": "snippet",
                "type": "video",
                "maxResults": limit,
                "safeSearch": "strict",
                "relevanceLanguage": "en",
                "videoEmbeddable": "true",
            },
            timeout=6,
        )
        response.raise_for_status()
        items = response.json().get("items", [])
    except Exception as exc:  # network / quota / auth errors are non-fatal
        print(f"[YOUTUBE] search failed: {exc}")
        return []

    results: list[dict[str, Any]] = []
    for item in items:
        video_id = (item.get("id") or {}).get("videoId")
        snippet = item.get("snippet") or {}
        if not video_id:
            continue
        results.append({
            "title": html.unescape(snippet.get("title", "")).strip() or "YouTube video",
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "channel": html.unescape(snippet.get("channelTitle", "")).strip(),
            "type": "youtube_video",
            "source": "youtube_data_api",
        })

    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES:
            _cache.pop(next(iter(_cache)), None)
        _cache[cache_key] = (now, results)
    return results
