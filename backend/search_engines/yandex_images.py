import re
import json
import logging
import html
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, quote
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("yandex_images")

class YandexImagesEngine:
    def __init__(self):
        self.upload_api_url = "https://yandex.com/images-apphost/image-download?cname=cbir"
        self.search_base_url = "https://yandex.com/images/search"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://yandex.com/images/",
            "Origin": "https://yandex.com",
            "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Upgrade-Insecure-Requests": "1"
        }

    async def upload_image_bytes(self, image_bytes: bytes) -> Optional[str]:
        """
        Uploads image binary to Yandex temporary storage and returns public URL.
        """
        try:
            upload_headers = self.headers.copy()
            upload_headers["Content-Type"] = "image/jpeg"
            async with httpx.AsyncClient(headers=upload_headers, timeout=20.0) as client:
                resp = await client.post(self.upload_api_url, content=image_bytes)
                if resp.status_code == 200:
                    data = resp.json()
                    staged_url = (
                        data.get("sizes", {}).get("orig", {}).get("path")
                        or data.get("url")
                    )
                    return staged_url
        except Exception as e:
            logger.warning(f"Yandex temporary upload failed: {e}")
        return None

    def _extract_results_from_html(self, html_text: str, search_url: str) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        seen_urls = set()

        # 1. Parse JSON from data-state attributes (Modern Yandex React SSR)
        state_matches = re.findall(r'data-state="([^"]+)"', html_text)
        for m in state_matches:
            try:
                unescaped = html.unescape(m)
                data = json.loads(unescaped)
                initial_state = data.get("initialState", {})

                # Check cbirSites & cbirSitesList
                sites = (
                    initial_state.get("cbirSites", {}).get("sites", [])
                    or initial_state.get("cbirSitesList", {}).get("sites", [])
                )

                for item in sites:
                    page_url = item.get("url")
                    if not page_url or page_url in seen_urls:
                        continue
                    seen_urls.add(page_url)

                    domain = item.get("domain") or urlparse(page_url).netloc
                    title = item.get("title") or "Yandex Visual Match"
                    thumb = item.get("thumb")
                    if isinstance(thumb, dict):
                        thumb = thumb.get("url")
                    if isinstance(thumb, str) and thumb.startswith("//"):
                        thumb = "https:" + thumb

                    results.append({
                        "engine": "yandex",
                        "title": title,
                        "thumbnail": thumb,
                        "source_url": page_url,
                        "domain": domain,
                        "similarity": 0.94,
                        "tag": "Visual Result"
                    })

                # Check cbirSimilar thumbs
                similar_thumbs = initial_state.get("cbirSimilar", {}).get("thumbs", [])
                for sim in similar_thumbs:
                    orig_url = sim.get("origUrl") or sim.get("url")
                    thumb_url = sim.get("url") or sim.get("thumbUrl")
                    if thumb_url and thumb_url.startswith("//"):
                        thumb_url = "https:" + thumb_url
                    if orig_url and orig_url not in seen_urls:
                        seen_urls.add(orig_url)
                        results.append({
                            "engine": "yandex",
                            "title": sim.get("title") or "Visually Similar Image",
                            "thumbnail": thumb_url,
                            "source_url": orig_url,
                            "domain": urlparse(orig_url).netloc,
                            "similarity": 0.88,
                            "tag": "Similar Image"
                        })
            except Exception as e:
                logger.debug(f"Error parsing data-state JSON: {e}")

        # 2. HTML DOM parsing fallback
        if len(results) < 5:
            soup = BeautifulSoup(html_text, "html.parser")
            for a in soup.find_all("a", href=True):
                h = a["href"]
                if not h.startswith("http") or any(x in h for x in ["yandex.", "ya.ru", "w3.org", "schema.org"]):
                    continue
                img = a.find("img")
                if img and h not in seen_urls:
                    seen_urls.add(h)
                    thumb = img.get("src") or img.get("data-src")
                    if thumb and thumb.startswith("//"):
                        thumb = "https:" + thumb
                    title = img.get("alt") or a.get_text(strip=True) or "Yandex Match"
                    results.append({
                        "engine": "yandex",
                        "title": title,
                        "thumbnail": thumb,
                        "source_url": h,
                        "domain": urlparse(h).netloc,
                        "similarity": 0.86,
                        "tag": "Web Result"
                    })

        # 3. Regex search for JSON objects containing origUrl / thumbUrl
        if len(results) < 3:
            pattern = r'\{[^{}]*?"origUrl":"([^"]+)"[^{}]*?\}'
            matches = re.finditer(pattern, html_text)
            for m in matches:
                try:
                    obj = json.loads(m.group(0))
                    orig = obj.get("origUrl")
                    if orig and orig not in seen_urls and not any(x in orig for x in ["yandex", "avatars.mds"]):
                        seen_urls.add(orig)
                        results.append({
                            "engine": "yandex",
                            "title": obj.get("title", "Yandex Web Match"),
                            "thumbnail": obj.get("thumbUrl"),
                            "source_url": orig,
                            "domain": urlparse(orig).netloc,
                            "similarity": 0.88,
                            "tag": "Web Match"
                        })
                except Exception:
                    continue

        return results

    async def search_by_url(self, image_url: str) -> Dict[str, Any]:
        """
        Reverse image search by public image URL.
        """
        encoded_url = quote(image_url, safe='')
        query_url = f"{self.search_base_url}?rpt=imageview&url={encoded_url}"
        results = []

        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=25.0) as client:
                resp = await client.get(query_url)
                final_url = str(resp.url)
                results = self._extract_results_from_html(resp.text, final_url)

            return {
                "engine": "yandex",
                "engine_name": "Yandex Images",
                "success": True,
                "search_url": query_url,
                "total_matches": len(results),
                "results": results,
                "message": f"Tìm thấy {len(results)} kết quả từ Yandex" if results else "Đã hoàn thành quét Yandex"
            }
        except Exception as e:
            logger.error(f"Yandex search_by_url error: {e}", exc_info=True)
            return {
                "engine": "yandex",
                "engine_name": "Yandex Images",
                "success": False,
                "search_url": query_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }

    async def search_by_bytes(self, image_bytes: bytes, filename: str = "image.jpg") -> Dict[str, Any]:
        """
        Reverse image search by image bytes via staging upload.
        """
        results: List[Dict[str, Any]] = []
        final_search_url = f"{self.search_base_url}?rpt=imageview"

        try:
            # Step 1: Upload to Yandex staging endpoint
            staged_url = await self.upload_image_bytes(image_bytes)
            if staged_url:
                final_search_url = f"{self.search_base_url}?rpt=imageview&url={quote(staged_url, safe='')}"
                return await self.search_by_url(staged_url)

            # Fallback: legacy upfile form upload
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=25.0) as client:
                files = {"upfile": (filename, image_bytes, "image/jpeg")}
                resp = await client.post(final_search_url, files=files)
                final_url = str(resp.url)
                results = self._extract_results_from_html(resp.text, final_url)

                return {
                    "engine": "yandex",
                    "engine_name": "Yandex Images",
                    "success": True,
                    "search_url": final_url,
                    "total_matches": len(results),
                    "results": results,
                    "message": f"Tìm thấy {len(results)} kết quả từ Yandex" if results else "Đã hoàn thành quét Yandex"
                }

        except Exception as e:
            logger.error(f"Yandex search_by_bytes error: {e}", exc_info=True)
            return {
                "engine": "yandex",
                "engine_name": "Yandex Images",
                "success": False,
                "search_url": final_search_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }
