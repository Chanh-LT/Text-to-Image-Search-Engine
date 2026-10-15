# OmniLens - Multi-Engine Reverse Image Search Tool

Ứng dụng Web tìm kiếm ảnh ngược (Reverse Image Search) bằng đa công cụ, kết hợp đồng thời **Google Lens**, **Bing Visual Search** và **Yandex Images**

---

## Tính Năng

- **Đa công cụ**: Tìm kiếm đồng thời trên **Google Lens**, **Bing Visual Search** và **Yandex**, bóc tách visual matches và web results.
- **Tiền xử lý ảnh linh hoạt (Crop Studio)**:
  - Hỗ trợ khoanh vùng chọn đối tượng trên ảnh (giống Google Lens) trước khi tìm kiếm.
  - Hỗ trợ tỷ lệ khung hình: Tự do, 1:1, 4:3, 16:9 hoặc toàn bộ ảnh.
- **Nhiều hình thức đưa ảnh vào**:
  - Kéo & Thả (Drag & Drop) ảnh trực tiếp.
  - Phím tắt **`Ctrl + V`** dán ảnh từ Clipboard ở bất kỳ đâu trên màn hình.
  - Tải file từ máy tính (JPG, PNG, WEBP, GIF).
  - Tìm kiếm qua đường dẫn URL hình ảnh trực tiếp.
  - Bộ ảnh mẫu thử nghiệm nhanh có sẵn trong 1 click.
- **Lightbox So Sánh Đối Chiếu**: Xem ảnh tìm thấy cạnh ảnh đầu vào của bạn để đối chiếu sự tương đồng.
- **Mở trực tiếp trên web chính thức**: Tạo sẵn liên kết trực tiếp mở kết quả trên giao diện chính thức của Google Lens, Bing Visual Search, Yandex và TinEye.
- **Tiện ích bổ trợ**:
  - Lưu **Lịch sử tìm kiếm** trong trình duyệt (LocalStorage).
  - **Xuất kết quả** ra file JSON hoặc sao chép toàn bộ links vào Clipboard.

---

## Hướng Dẫn Cài Đặt & Sử Dụng

### Cách 1: Khởi động nhanh bằng file Batch (Khuyên dùng trên Windows)
Chỉ cần nhấp đúp vào file:
```
run.bat
```
Ứng dụng sẽ tự động kiểm tra môi trường, khởi động server và mở trình duyệt web tại `http://127.0.0.1:8000`.

---

### Cách 2: Khởi động thủ công qua Terminal
1. Cài đặt các thư viện phụ thuộc:
```bash
pip install -r requirements.txt
```

2. Khởi chạy server FastAPI:
```bash
python main.py
```

3. Mở trình duyệt và truy cập:
```
http://127.0.0.1:8000
```

---

## Cấu Trúc Dự Án

```
d:/Image_Search_Tool/
│
├── backend/
│   ├── search_engines/
│   │   ├── google_lens.py      # Bóc tách và tạo phiên tìm kiếm Google Lens
│   │   ├── bing_visual.py      # Bóc tách Bing Visual Search
│   │   └── yandex_images.py    # Bóc tách Yandex Images
│   │
│   └── services/
│       ├── image_processor.py  # Xử lý, cắt crop, tối ưu hóa ảnh bằng Pillow
│       └── search_service.py   # Điều phối truy vấn đa luồng song song
│
├── static/
│   ├── css/
│   │   └── style.css           # Hệ thống giao diện Dark Glassmorphism
│   ├── js/
│   │   ├── cropper.js          # Bộ Canvas Cropper khoanh vùng đối tượng
│   │   └── app.js              # Controller ứng dụng, gọi API và render UI
│   └── index.html              # Trang giao diện chính
│
├── main.py                     # Máy chủ FastAPI và REST API endpoints
├── requirements.txt            # Danh sách thư viện Python
├── run.bat                     # File chạy nhanh trên Windows
└── README.md                   # Hướng dẫn sử dụng
```
