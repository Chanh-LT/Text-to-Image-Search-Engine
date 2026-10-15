import re
import json
import logging
import base64
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse, quote
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("bing_visual")

class BingVisualEngine:
    def __init__(self):
        self.search_url_base = "https://www.bing.com/images/search"
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.bing.com/",
            "Origin": "https://www.bing.com",
            "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Upgrade-Insecure-Requests": "1"
        }

    @staticmethod
    def _decode_bing_click_url(u: str) -> str:
        """Decodes Bing click-tracking redirect URL containing u=a1<base64>."""
        if "u=a1" in u:
            try:
                part = u.split("u=a1")[1].split("&")[0]
                rem = len(part) % 4
                if rem:
                    part += "=" * (4 - rem)
                decoded = base64.urlsafe_b64decode(part).decode("utf-8", errors="ignore")
                if decoded.startswith("http"):
                    return decoded
            except Exception:
                pass
        return u

    def _extract_results_from_html(self, html: str, base_url: str) -> List[Dict[str, Any]]:
        results = []
        soup = BeautifulSoup(html, "html.parser")
        seen_urls = set()

        # 1. Tags with 'm' or 'data-m' containing JSON metadata (Bing Images)
        m_tags = soup.find_all(attrs={"m": True}) + soup.find_all(attrs={"data-m": True})
        for tag in m_tags:
            try:
                raw_m = tag.get("m") or tag.get("data-m")
                m_data = json.loads(raw_m)
                page_url = m_data.get("purl") or m_data.get("surl")
                media_url = m_data.get("murl") or m_data.get("turl")
                title = m_data.get("t") or m_data.get("desc") or "Bing Visual Match"

                if page_url and page_url not in seen_urls:
                    seen_urls.add(page_url)
                    domain = urlparse(page_url).netloc
                    results.append({
                        "engine": "bing",
                        "title": title,
                        "thumbnail": media_url,
                        "source_url": page_url,
                        "domain": domain,
                        "similarity": 0.91,
                        "tag": "Visual Match"
                    })
            except Exception:
                continue

        # 2. Organic web results (.b_algo) if Bing redirected to visual search entity page
        if len(results) < 5:
            for item in soup.select(".b_algo"):
                h2 = item.find("h2")
                link = h2.find("a") if h2 else item.find("a")
                if not link or not link.get("href"):
                    continue
                raw_href = link["href"]
                final_href = self._decode_bing_click_url(raw_href)
                if final_href in seen_urls or any(x in final_href for x in ["bing.com", "microsoft.com"]):
                    continue

                seen_urls.add(final_href)
                title = link.get_text(strip=True) or "Bing Web Match"
                domain = urlparse(final_href).netloc
                snippet_el = item.select_one(".b_caption, p")
                img = item.find("img")
                thumb = img.get("src") or img.get("data-src") if img else None

                results.append({
                    "engine": "bing",
                    "title": title,
                    "thumbnail": thumb,
                    "source_url": final_href,
                    "domain": domain,
                    "similarity": 0.85,
                    "tag": "Web Match"
                })

        # 3. Visual Search cards (.richImgLnk, .vsw_item, .imgpt)
        if len(results) < 3:
            cards = soup.select(".richImgLnk, .vsw_item, .imgpt, .iusc, .card")
            for card in cards:
                link = card.find("a", href=True)
                img = card.find("img")
                if link and img:
                    href = link["href"]
                    if href.startswith("/"):
                        href = "https://www.bing.com" + href
                    if href.startswith("http") and href not in seen_urls:
                        seen_urls.add(href)
                        thumb = img.get("src") or img.get("data-src") or img.get("data-src-hq")
                        title = img.get("alt") or link.get("title") or card.get_text(strip=True) or "Bing Visual Match"
                        domain = urlparse(href).netloc
                        results.append({
                            "engine": "bing",
                            "title": title,
                            "thumbnail": thumb,
                            "source_url": href,
                            "domain": domain,
                            "similarity": 0.88,
                            "tag": "Visual Match"
                        })

        # 4. Regex fallback for JSON objects with murl / purl
        if len(results) < 3:
            pattern = r'\{[^{}]*?"murl":"([^"]+)"[^{}]*?"purl":"([^"]+)"[^{}]*?\}'
            matches = re.finditer(pattern, html)
            for m in matches:
                try:
                    obj = json.loads(m.group(0))
                    purl = obj.get("purl")
                    murl = obj.get("murl")
                    if purl and purl not in seen_urls:
                        seen_urls.add(purl)
                        results.append({
                            "engine": "bing",
                            "title": obj.get("t", "Bing Visual Match"),
                            "thumbnail": murl,
                            "source_url": purl,
                            "domain": urlparse(purl).netloc,
                            "similarity": 0.88,
                            "tag": "Visual Search Result"
                        })
                except Exception:
                    continue

        return results

    async def search_by_url(self, image_url: str) -> Dict[str, Any]:
        """
        Executes Bing Visual Reverse Image Search using an image URL.
        """
        encoded_url = quote(image_url, safe='')
        query_url = f"{self.search_url_base}?iss=sbi&q=imgurl:{encoded_url}"
        results = []

        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=25.0) as client:
                resp = await client.get(query_url)
                final_url = str(resp.url)
                results = self._extract_results_from_html(resp.text, final_url)

            return {
                "engine": "bing",
                "engine_name": "Bing Visual Search",
                "success": True,
                "search_url": query_url,
                "total_matches": len(results),
                "results": results,
                "message": f"Tìm thấy {len(results)} kết quả từ Bing Visual" if results else "Đã hoàn thành quét Bing Visual"
            }
        except Exception as e:
            logger.error(f"Bing search_by_url error: {e}", exc_info=True)
            return {
                "engine": "bing",
                "engine_name": "Bing Visual Search",
                "success": False,
                "search_url": query_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }

    async def search_by_bytes(
        self,
        image_bytes: bytes,
        filename: str = "image.jpg",
        staged_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Reverse image search for bytes. Uses staged_url if available.
        """
        if staged_url:
            return await self.search_by_url(staged_url)

        query_url = f"{self.search_url_base}?view=detailv2&iss=sbiupload&FORM=SBIHMP"
        results = []

        try:
            async with httpx.AsyncClient(headers=self.headers, follow_redirects=True, timeout=25.0) as client:
                files = {"imageBin": (filename, image_bytes, "image/jpeg")}
                resp = await client.post(query_url, files=files)
                final_url = str(resp.url)
                results = self._extract_results_from_html(resp.text, final_url)

            return {
                "engine": "bing",
                "engine_name": "Bing Visual Search",
                "success": True,
                "search_url": final_url,
                "total_matches": len(results),
                "results": results,
                "message": f"Tìm thấy {len(results)} kết quả từ Bing Visual" if results else "Đã hoàn thành quét Bing Visual"
            }
        except Exception as e:
            logger.error(f"Bing search_by_bytes error: {e}", exc_info=True)
            return {
                "engine": "bing",
                "engine_name": "Bing Visual Search",
                "success": False,
                "search_url": query_url,
                "total_matches": 0,
                "results": [],
                "error": str(e)
            }
