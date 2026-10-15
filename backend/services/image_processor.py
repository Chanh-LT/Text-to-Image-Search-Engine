import io
import base64
from typing import Optional, Dict, Any, Tuple
from PIL import Image

class ImageProcessor:
    @staticmethod
    def inspect_image(image_bytes: bytes) -> Dict[str, Any]:
        """
        Extract detailed metadata from image bytes.
        """
        img = Image.open(io.BytesIO(image_bytes))
        width, height = img.size
        size_kb = round(len(image_bytes) / 1024, 2)
        aspect_ratio = f"{round(width / max(height, 1), 2)}:1"
        
        return {
            "width": width,
            "height": height,
            "format": img.format or "UNKNOWN",
            "mode": img.mode,
            "size_kb": size_kb,
            "aspect_ratio": aspect_ratio,
        }

    @staticmethod
    def process_and_crop(
        image_bytes: bytes,
        crop_box: Optional[Tuple[float, float, float, float]] = None,
        max_dim: int = 1600
    ) -> Tuple[bytes, Dict[str, Any]]:
        """
        Processes image:
        - Crops to crop_box (x, y, width, height) if provided
        - Resizes if larger than max_dim
        - Converts to RGB JPEG for search engines
        - Returns (optimized_jpeg_bytes, metadata)
        """
        img = Image.open(io.BytesIO(image_bytes))
        orig_w, orig_h = img.size

        # If crop box is provided: (x, y, width, height)
        if crop_box:
            x, y, w, h = crop_box
            # Ensure coordinates are within image boundaries
            x = max(0, min(orig_w, int(x)))
            y = max(0, min(orig_h, int(y)))
            w = max(10, min(orig_w - x, int(w)))
            h = max(10, min(orig_h - y, int(h)))
            
            box = (x, y, x + w, y + h)
            img = img.crop(box)

        # Convert palette/transparency to RGB
        if img.mode in ("RGBA", "LA", "P"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if img.mode == "RGBA" else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale if larger than max_dim to ensure lightning-fast upload
        cur_w, cur_h = img.size
        if max(cur_w, cur_h) > max_dim:
            scale = max_dim / max(cur_w, cur_h)
            new_w = max(1, int(cur_w * scale))
            new_h = max(1, int(cur_h * scale))
            img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Output to optimized JPEG
        out_buf = io.BytesIO()
        img.save(out_buf, format="JPEG", quality=88, optimize=True)
        optimized_bytes = out_buf.getvalue()

        metadata = {
            "width": img.width,
            "height": img.height,
            "size_kb": round(len(optimized_bytes) / 1024, 2),
            "format": "JPEG",
            "aspect_ratio": f"{round(img.width / max(img.height, 1), 2)}:1",
        }

        return optimized_bytes, metadata

    @staticmethod
    def to_base64_data_uri(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
        b64 = base64.b64encode(image_bytes).decode("ascii")
        return f"data:{mime_type};base64,{b64}"
