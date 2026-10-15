import os
import io
import logging
from typing import Optional
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from backend.services.search_service import SearchService
from backend.services.image_processor import ImageProcessor

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("app")

app = FastAPI(
    title="OmniLens - Multi-Engine Reverse Image Search",
    description="Công cụ tìm kiếm ảnh ngược đa nguồn (Google Lens, Bing, Yandex) miễn phí không cần API Key",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

search_service = SearchService()

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "app": "OmniLens Reverse Image Search",
        "supported_engines": ["google", "bing", "yandex"]
    }

@app.post("/api/metadata")
async def inspect_metadata(file: UploadFile = File(...)):
    try:
        content = await file.read()
        metadata = ImageProcessor.inspect_image(content)
        preview = ImageProcessor.to_base64_data_uri(content)
        return {
            "success": True,
            "filename": file.filename,
            "metadata": metadata,
            "preview": preview
        }
    except Exception as e:
        logger.error(f"Error inspecting metadata: {e}")
        raise HTTPException(status_code=400, detail=f"Không thể đọc file ảnh: {str(e)}")

@app.post("/api/search")
async def search_image(
    file: Optional[UploadFile] = File(None),
    image_url: Optional[str] = Form(None),
    crop_x: Optional[float] = Form(None),
    crop_y: Optional[float] = Form(None),
    crop_w: Optional[float] = Form(None),
    crop_h: Optional[float] = Form(None),
    engine: str = Form("all")
):
    try:
        image_bytes = None
        if file and file.filename:
            image_bytes = await file.read()

        if not image_bytes and not image_url:
            raise HTTPException(
                status_code=400,
                detail="Vui lòng cung cấp file ảnh hoặc URL ảnh hợp lệ."
            )

        crop_box = None
        if all(v is not None for v in (crop_x, crop_y, crop_w, crop_h)):
            if crop_w > 0 and crop_h > 0:
                crop_box = (float(crop_x), float(crop_y), float(crop_w), float(crop_h))

        response = await search_service.execute_search(
            image_bytes=image_bytes,
            image_url=image_url,
            crop_box=crop_box,
            target_engine=engine.lower()
        )

        return JSONResponse(content={"success": True, "data": response})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Search API execution failed: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": f"Lỗi xử lý tìm kiếm: {str(e)}"}
        )

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "OmniLens Backend is running. Please add static/index.html."}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "127.0.0.1")
    uvicorn.run("main:app", host=host, port=port, reload=False)
