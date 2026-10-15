/**
 * OmniLens Canvas Cropper
 * Interactive Google Lens-style object selector with bounding box and handles.
 */

class ImageCropper {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = null;
    
    // Scale & offset of image on canvas
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    // Crop box in canvas coordinates: {x, y, w, h}
    this.crop = { x: 0, y: 0, w: 0, h: 0 };
    
    // Active interaction
    this.isDragging = false;
    this.dragType = null; // 'move', 'tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r', 'new'
    this.dragStart = { x: 0, y: 0 };
    this.cropStart = { x: 0, y: 0, w: 0, h: 0 };
    
    // Config
    this.handleSize = 14;
    this.aspectRatio = null; // null for free, or number like 1, 4/3, 16/9

    this._bindEvents();
  }

  loadImage(imgElement) {
    this.img = imgElement;
    this.resizeCanvas();
    this.resetToFull();
    this.render();
  }

  setAspectRatio(ratio) {
    this.aspectRatio = ratio;
    if (ratio && this.crop.w > 0 && this.crop.h > 0) {
      let newH = this.crop.w / ratio;
      if (this.crop.y + newH > this.offsetY + this.img.height * this.scale) {
        newH = this.offsetY + this.img.height * this.scale - this.crop.y;
        this.crop.w = newH * ratio;
      }
      this.crop.h = newH;
      this.render();
    }
  }

  resizeCanvas() {
    if (!this.img) return;
    const parent = this.canvas.parentElement;
    const maxW = parent.clientWidth || 800;
    const maxH = 500;

    const imgW = this.img.naturalWidth || this.img.width;
    const imgH = this.img.naturalHeight || this.img.height;

    const scaleW = maxW / imgW;
    const scaleH = maxH / imgH;
    this.scale = Math.min(scaleW, scaleH, 1.0);

    const canvasW = Math.round(imgW * this.scale);
    const canvasH = Math.round(imgH * this.scale);

    this.canvas.width = canvasW;
    this.canvas.height = canvasH;
    this.offsetX = 0;
    this.offsetY = 0;
  }

  resetToFull() {
    if (!this.img) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    // Default margin of 8% like Google Lens
    const padX = Math.round(w * 0.06);
    const padY = Math.round(h * 0.06);
    this.crop = {
      x: padX,
      y: padY,
      w: w - padX * 2,
      h: h - padY * 2
    };
    if (this.aspectRatio) {
      this.setAspectRatio(this.aspectRatio);
    }
    this.render();
  }

  getCropCoordinates() {
    if (!this.img) return null;
    const origW = this.img.naturalWidth || this.img.width;
    const origH = this.img.naturalHeight || this.img.height;

    // Convert from canvas coordinate to original image coordinate
    const x = Math.max(0, Math.round(this.crop.x / this.scale));
    const y = Math.max(0, Math.round(this.crop.y / this.scale));
    const w = Math.min(origW - x, Math.round(this.crop.w / this.scale));
    const h = Math.min(origH - y, Math.round(this.crop.h / this.scale));

    return { x, y, width: w, height: h };
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
    window.addEventListener('mousemove', (e) => this._onMouseMove(e));
    window.addEventListener('mouseup', () => this._onMouseUp());

    // Touch support for mobile / tablets
    this.canvas.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      this._onMouseDown(touch);
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (this.isDragging) {
        const touch = e.touches[0];
        this._onMouseMove(touch);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('touchend', () => this._onMouseUp());
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  _getHandleAt(x, y) {
    const hs = this.handleSize;
    const { x: cx, y: cy, w: cw, h: ch } = this.crop;

    const handles = {
      tl: { x: cx, y: cy },
      tr: { x: cx + cw, y: cy },
      bl: { x: cx, y: cy + ch },
      br: { x: cx + cw, y: cy + ch },
      t:  { x: cx + cw / 2, y: cy },
      b:  { x: cx + cw / 2, y: cy + ch },
      l:  { x: cx, y: cy + ch / 2 },
      r:  { x: cx + cw, y: cy + ch / 2 }
    };

    for (const [key, pt] of Object.entries(handles)) {
      if (Math.abs(x - pt.x) <= hs && Math.abs(y - pt.y) <= hs) {
        return key;
      }
    }

    if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
      return 'move';
    }

    return 'new';
  }

  _onMouseDown(e) {
    if (!this.img) return;
    const pos = this._getCanvasPos(e);
    this.dragType = this._getHandleAt(pos.x, pos.y);
    this.isDragging = true;
    this.dragStart = pos;
    this.cropStart = { ...this.crop };

    if (this.dragType === 'new') {
      this.crop = { x: pos.x, y: pos.y, w: 1, h: 1 };
      this.dragType = 'br';
      this.cropStart = { ...this.crop };
    }
  }

  _onMouseMove(e) {
    const pos = this._getCanvasPos(e);

    if (!this.isDragging) {
      // Update cursor
      if (this.img) {
        const handle = this._getHandleAt(pos.x, pos.y);
        const cursors = {
          tl: 'nwse-resize', br: 'nwse-resize',
          tr: 'nesw-resize', bl: 'nesw-resize',
          t: 'ns-resize', b: 'ns-resize',
          l: 'ew-resize', r: 'ew-resize',
          move: 'move',
          new: 'crosshair'
        };
        this.canvas.style.cursor = cursors[handle] || 'crosshair';
      }
      return;
    }

    const dx = pos.x - this.dragStart.x;
    const dy = pos.y - this.dragStart.y;
    const minSize = 25;
    const maxW = this.canvas.width;
    const maxH = this.canvas.height;

    let { x, y, w, h } = this.cropStart;

    if (this.dragType === 'move') {
      x = Math.max(0, Math.min(maxW - w, x + dx));
      y = Math.max(0, Math.min(maxH - h, y + dy));
      this.crop.x = x;
      this.crop.y = y;
    } else {
      // Resizing
      if (this.dragType.includes('r')) {
        w = Math.max(minSize, Math.min(maxW - x, w + dx));
      }
      if (this.dragType.includes('l')) {
        const newX = Math.max(0, Math.min(x + w - minSize, x + dx));
        w += (x - newX);
        x = newX;
      }
      if (this.dragType.includes('b')) {
        h = Math.max(minSize, Math.min(maxH - y, h + dy));
      }
      if (this.dragType.includes('t')) {
        const newY = Math.max(0, Math.min(y + h - minSize, y + dy));
        h += (y - newY);
        y = newY;
      }

      // Maintain aspect ratio if set
      if (this.aspectRatio) {
        if (this.dragType.includes('r') || this.dragType.includes('l')) {
          h = w / this.aspectRatio;
        } else {
          w = h * this.aspectRatio;
        }
      }

      this.crop = { x, y, w, h };
    }

    this.render();
  }

  _onMouseUp() {
    this.isDragging = false;
    this.dragType = null;
    // Normalize negative dimensions if any
    if (this.crop.w < 0) {
      this.crop.x += this.crop.w;
      this.crop.w = Math.abs(this.crop.w);
    }
    if (this.crop.h < 0) {
      this.crop.y += this.crop.h;
      this.crop.h = Math.abs(this.crop.h);
    }
    this.render();
  }

  render() {
    if (!this.img) return;
    const ctx = this.ctx;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);

    // 1. Draw original image
    ctx.drawImage(this.img, 0, 0, width, height);

    // 2. Dark overlay outside crop box
    ctx.fillStyle = 'rgba(4, 8, 16, 0.65)';
    ctx.fillRect(0, 0, width, this.crop.y); // top
    ctx.fillRect(0, this.crop.y + this.crop.h, width, height - (this.crop.y + this.crop.h)); // bottom
    ctx.fillRect(0, this.crop.y, this.crop.x, this.crop.h); // left
    ctx.fillRect(this.crop.x + this.crop.w, this.crop.y, width - (this.crop.x + this.crop.w), this.crop.h); // right

    // 3. Glowing cyan border around selection
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 242, 254, 0.6)';
    ctx.shadowBlur = 10;
    ctx.strokeRect(this.crop.x, this.crop.y, this.crop.w, this.crop.h);
    ctx.shadowBlur = 0;

    // 4. Rule-of-thirds grid lines inside selection
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    // vertical lines
    ctx.moveTo(this.crop.x + this.crop.w / 3, this.crop.y);
    ctx.lineTo(this.crop.x + this.crop.w / 3, this.crop.y + this.crop.h);
    ctx.moveTo(this.crop.x + (this.crop.w * 2) / 3, this.crop.y);
    ctx.lineTo(this.crop.x + (this.crop.w * 2) / 3, this.crop.y + this.crop.h);
    // horizontal lines
    ctx.moveTo(this.crop.x, this.crop.y + this.crop.h / 3);
    ctx.lineTo(this.crop.x + this.crop.w, this.crop.y + this.crop.h / 3);
    ctx.moveTo(this.crop.x, this.crop.y + (this.crop.h * 2) / 3);
    ctx.lineTo(this.crop.x + this.crop.w, this.crop.y + (this.crop.h * 2) / 3);
    ctx.stroke();

    // 5. Draw 4 Corner Handles (Lens style brackets)
    const bLen = Math.min(22, this.crop.w / 3, this.crop.h / 3);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';

    const { x, y, w, h } = this.crop;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(x, y + bLen); ctx.lineTo(x, y); ctx.lineTo(x + bLen, y);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + bLen);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(x, y + h - bLen); ctx.lineTo(x, y + h); ctx.lineTo(x + bLen, y + h);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(x + w - bLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - bLen);
    ctx.stroke();

    // 6. Draw center edge dots
    ctx.fillStyle = '#00f2fe';
    const dotR = 3;
    const drawDot = (dx, dy) => {
      ctx.beginPath();
      ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
      ctx.fill();
    };
    drawDot(x + w / 2, y);
    drawDot(x + w / 2, y + h);
    drawDot(x, y + h / 2);
    drawDot(x + w, y + h / 2);
  }
}
