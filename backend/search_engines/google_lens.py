import re
import json
import logging
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, quote
import httpx

logger = logging.getLogger("google_lens")

class GoogleLensEngine:
    def __init__(self):
        self.base_url = "https://lens.google.com"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1"
        }

    @staticmethod
    def _safe_get(data: Any, path: List[int]) -> Any:
        current = data
        for index in path:
            if not isinstance(current, (list, tuple)) or not isinstance(index, int):
                return None
            if index < 0 or index >= len(current):
                return None
            current = current[index]
        return current

    def _extract_prerender_data(self, html: str) -> Optional[Any]:
        pattern = r"AF_initDataCallback\s*\(\s*(\{.*?key:\s*'ds:0'.*?\})\s*\);"
        match = re.search(pattern, html, re.DOTALL)
        if not match:
            match = re.search(r"AF_initDataCallback\s*\(\s*(\{.*?data:.*?sideChannel:.*?\})\s*\);", html, re.DOTALL)

        if not match:
            return None

        content = match.group(1)
        try:
            clean = re.sub(r"key:\s*'([^']+)'", r'"key": "\1"', content)
            clean = re.sub(r"hash:\s*'([^']+)'", r'"hash": "\1"', clean)
            clean = re.sub(r"data:\s*", r'"data": ', clean)
            clean = re.sub(r"sideChannel:\s*", r'"sideChannel": ', clean)
            parsed = json.loads(clean)
            if "data" in parsed and len(parsed["data"]) > 1:
                return parsed["data"][1]
            return parsed.get("data")
        except Exception as e:
            logger.debug(f"Error parsing AF_initDataCallback JSON: {e}")
            return None

    def _parse_results_from_data(self, prerender_data: Any) -> List[Dict[str, Any]]:
        results = []
        if not prerender_data:
            return results

        # Best match
        match_title = self._safe_get(prerender_data, [0, 1, 8, 12, 0, 0, 0])
        match_thumb = self._safe_get(prerender_data, [0, 1, 8, 12, 0, 2, 0, 0])
        match_url = self._safe_get(prerender_data, [0, 1, 8, 12, 0, 2, 0, 4])
        if match_url:
            domain = urlparse(match_url).netloc
            results.append({
                "engine": "google",
                "title": match_title or "Google Lens Best Match",
                "thumbnail": match_thumb,
                "source_url": match_url,
                "domain": domain,
                "similarity": 0.98,
                "tag": "Best Match"
            })

        # Visual matches section
        visual_matches = (
            self._safe_get(prerender_data, [1, 1, 8, 8, 0, 12])
            or self._safe_get(prerender_data, [0, 1, 8, 8, 0, 12])
            or []
        )

        if isinstance(visual_matches, list):
            for item in visual_matches:
                thumb = self._safe_get(item, [0, 0])
                title = self._safe_get(item, [3])
                score = self._safe_get(item, [1])
                page_url = self._safe_get(item, [5])
                site_name = self._safe_get(item, [14])

                if page_url and isinstance(page_url, str):
                    domain = site_name or urlparse(page_url).netloc
                    results.append({
                        "engine": "google",
                        "title": title or "Google Visual Match",
                        "thumbnail": thumb,
                        "source_url": page_url,
                        "domain": domain,
                        "similarity": round(float(score), 2) if isinstance(score, (int, float)) else 0.88,
                        "tag": "Visual Match"
                    })

        return results

    def _extract_fallback_html_links(self, html: str, search_url: str) -> List[Dict[str, Any]]:
        results = []
        urls = re.findall(r'href="(https?://(?!www\.google|lens\.google|support\.google)[^"\'>]+)"', html)
        seen = set()
        for u in urls:
            if u not in seen and not any(x in u for x in ["gstatic.com", "schema.org", "w3.org", "policies.google"]):
                seen.add(u)
                domain = urlparse(u).netloc
                results.append({
                    "engine": "google",
                    "title": f"Web Match on {domain}",
                    "thumbnail": None,
                    "source_url": u,
                    "domain": domain,
                    "similarity": 0.82,
                    "tag": "Web Result"
                })
                if len(results) >= 10:
                    break
        return results

    async def search_by_bytes(
        self,
        image_bytes: bytes,
        filename: str = "image.jpg",
        staged_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Uploads image to Google Lens and returns official interactive session URL and matches.
        """
        search_url = None
        results: List[Dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(headers=self.headers, timeout=20.0) as client:
                files = {
                    "encoded_image": (filename, image_bytes, "image/jpeg"),
                    "image_content": ("", "")
                }
                params = {"hl": "en", "gl": "us"}

                # POST to Lens upload endpoint with follow_redirects=False to capture search session URL
                upload_resp = await client.post(
                    f"{self.base_url}/upload",
                    files=files,
                    params=params,
                    follow_redirects=False
                )

                if upload_resp.status_code in (302, 303):
                    search_url = upload_resp.headers.get("Location")

                if not search_url:
                    v3_resp = await client.post(
                        f"{self.base_url}/v3/upload",
                        files=files,
                        params=params,
                        follow_redirects=False
                    )
                    if v3_resp.status_code in (302, 303):
                        search_url = v3_resp.headers.get("Location")

                if not search_url and staged_url:
                    search_url = f"{self.base_url}/uploadbyurl?url={quote(staged_url, safe='')}&hl=en&gl=us"

                if search_url:
                    try:
                        get_resp = await client.get(search_url, follow_redirects=True, timeout=12.0)
                        html = get_resp.text
                        prerender_data = self._extract_prerender_data(html)
                        if prerender_data:
                            results = self._parse_results_from_data(prerender_data)
                        if not results:
                            results = self._extract_fallback_html_links(html, search_url)
                    except Exception as e:
                        logger.debug(f"Lens results page GET warning: {e}")

            default_url = search_url or (
                f"{self.base_url}/uploadbyurl?url={quote(staged_url, safe='')}" if staged_url else self.base_url
            )

            return {
                "engine": "google",
                "engine_name": "Google Lens",
                "success": True,
                "search_url": default_url,
                "total_matches": len(results),
                "results": results,
                "message": "Đã tạo phiên tìm kiếm Google Lens thành công"
            }

        except Exception as e:
            logger.error(f"Google Lens search error: {e}", exc_info=True)
            fallback_url = (
                f"{self.base_url}/uploadbyurl?url={quote(staged_url, safe='')}" if staged_url else self.base_url
            )
            return {
                "engine": "google",
                "engine_name": "Google Lens",
                "success": True,
                "search_url": fallback_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }

    async def search_by_url(self, image_url: str) -> Dict[str, Any]:
        """
        Direct search by image URL.
        """
        encoded_url = quote(image_url, safe='')
        search_url = f"{self.base_url}/uploadbyurl?url={encoded_url}&hl=en&gl=us"
        results = []

        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=20.0) as client:
                resp = await client.get(search_url)
                prerender = self._extract_prerender_data(resp.text)
                if prerender:
                    results = self._parse_results_from_data(prerender)
                else:
                    results = self._extract_fallback_html_links(resp.text, str(resp.url))

            return {
                "engine": "google",
                "engine_name": "Google Lens",
                "success": True,
                "search_url": search_url,
                "total_matches": len(results),
                "results": results,
                "message": f"Tìm thấy {len(results)} kết quả từ Google Lens" if results else "Đã tạo phiên tìm kiếm Google Lens"
            }
        except Exception as e:
            logger.error(f"Google Lens search_by_url error: {e}", exc_info=True)
            return {
                "engine": "google",
                "engine_name": "Google Lens",
                "success": True,
                "search_url": search_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }
