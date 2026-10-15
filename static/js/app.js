/**
 * OmniLens - Application Controller
 * Handles image uploading, clipboard pasting, cropper integration,
 * search execution, results rendering, lightbox comparisons, and history.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const imageUrlInput = document.getElementById('imageUrlInput');
  const btnFetchUrl = document.getElementById('btnFetchUrl');
  const sampleChips = document.querySelectorAll('.sample-chip');

  const cropStudioCard = document.getElementById('cropStudioCard');
  const cropCanvas = document.getElementById('cropCanvas');
  const btnCropReset = document.getElementById('btnCropReset');
  const btnCancelCrop = document.getElementById('btnCancelCrop');
  const btnSearchCrop = document.getElementById('btnSearchCrop');
  const btnSearchFull = document.getElementById('btnSearchFull');
  const cropPills = document.querySelectorAll('.crop-pill');
  const imageMetaText = document.getElementById('imageMetaText');

  const searchLoader = document.getElementById('searchLoader');
  const resultsSection = document.getElementById('resultsSection');
  const resultsGrid = document.getElementById('resultsGrid');
  const resultsCount = document.getElementById('resultsCount');
  const tabBtns = document.querySelectorAll('.tab-btn');

  // Direct engine links
  const linkGoogle = document.getElementById('linkGoogle');
  const linkBing = document.getElementById('linkBing');
  const linkYandex = document.getElementById('linkYandex');
  const linkTinEye = document.getElementById('linkTinEye');

  // History & Export
  const btnOpenHistory = document.getElementById('btnOpenHistory');
  const btnCloseHistory = document.getElementById('btnCloseHistory');
  const historyDrawer = document.getElementById('historyDrawer');
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const btnExportJson = document.getElementById('btnExportJson');
  const btnCopyLinks = document.getElementById('btnCopyLinks');

  // Lightbox Modal
  const compareModal = document.getElementById('compareModal');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const compareQueryImg = document.getElementById('compareQueryImg');
  const compareResultImg = document.getElementById('compareResultImg');
  const compareResultTitle = document.getElementById('compareResultTitle');
  const compareSourceBtn = document.getElementById('compareSourceBtn');
  const compareDownloadBtn = document.getElementById('compareDownloadBtn');

  const toastContainer = document.getElementById('toastContainer');

  // State
  let cropper = null;
  let currentFile = null;
  let currentImageSource = null; // dataURI or URL
  let currentMetadata = null;
  let allResults = [];
  let currentActiveTab = 'all';
  let lastSearchData = null;

  // Initialize Cropper
  if (cropCanvas) {
    cropper = new ImageCropper(cropCanvas);
  }

  // Toast Helper
  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ'
    };
    toast.innerHTML = `<span style="font-weight:700;">${icons[type] || '•'}</span> <span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Load Image into Crop Studio
  function loadAndDisplayImage(fileOrBlob, dataUrl) {
    currentFile = fileOrBlob;
    currentImageSource = dataUrl;

    const img = new Image();
    img.onload = () => {
      currentMetadata = {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        size_kb: fileOrBlob && fileOrBlob.size ? (fileOrBlob.size / 1024).toFixed(1) : 'N/A'
      };

      imageMetaText.textContent = `${currentMetadata.width} × ${currentMetadata.height} px • ${currentMetadata.size_kb} KB`;
      cropStudioCard.style.display = 'block';
      cropStudioCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Load into cropper canvas
      cropper.loadImage(img);
      showToast('Đã tải ảnh vào phòng Cắt & Chọn đối tượng', 'info');
    };
    img.onerror = () => {
      showToast('Không thể đọc file ảnh. Vui lòng thử lại với định dạng khác (JPG, PNG, WEBP)', 'error');
    };
    img.src = dataUrl;
  }

  // File Upload Handlers
  function handleFileSelected(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Vui lòng chọn một file hình ảnh hợp lệ (JPG, PNG, WEBP, GIF)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      loadAndDisplayImage(file, e.target.result);
    };
    reader.readAsDataURL(file);
  }

  // Dropzone Events
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  // Global Clipboard Paste Listener (Ctrl+V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        handleFileSelected(blob);
        showToast('Đã dán ảnh từ Clipboard thành công!', 'success');
        break;
      }
    }
  });

  // URL Fetch Handler
  async function fetchImageFromUrl(url) {
    if (!url || !url.startsWith('http')) {
      showToast('Vui lòng nhập đường dẫn URL ảnh hợp lệ (http:// hoặc https://)', 'error');
      return;
    }
    showToast('Đang tải ảnh từ đường dẫn URL...', 'info');

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('Không thể tải trực tiếp qua CORS');
      const blob = await response.blob();
      handleFileSelected(blob);
    } catch (err) {
      // If CORS blocks direct fetch, perform search directly via image_url parameter
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        loadAndDisplayImage(null, url);
      };
      img.onerror = () => {
        // Run search directly via backend URL endpoint
        executeSearch({ imageUrl: url, cropBox: null });
      };
      img.src = url;
    }
  }

  btnFetchUrl.addEventListener('click', () => {
    fetchImageFromUrl(imageUrlInput.value.trim());
  });

  imageUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      fetchImageFromUrl(imageUrlInput.value.trim());
    }
  });

  // Sample Images Picker
  sampleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const sampleUrl = chip.getAttribute('data-url');
      if (sampleUrl) {
        imageUrlInput.value = sampleUrl;
        fetchImageFromUrl(sampleUrl);
      }
    });
  });

  // Cropper Controls
  cropPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      cropPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const ratioVal = pill.getAttribute('data-ratio');
      if (ratioVal === 'free') {
        cropper.setAspectRatio(null);
      } else if (ratioVal === '1:1') {
        cropper.setAspectRatio(1);
      } else if (ratioVal === '4:3') {
        cropper.setAspectRatio(4 / 3);
      } else if (ratioVal === '16:9') {
        cropper.setAspectRatio(16 / 9);
      }
    });
  });

  btnCropReset.addEventListener('click', () => cropper.resetToFull());
  btnCancelCrop.addEventListener('click', () => {
    cropStudioCard.style.display = 'none';
    currentFile = null;
    currentImageSource = null;
  });

  btnSearchCrop.addEventListener('click', () => {
    const coords = cropper.getCropCoordinates();
    executeSearch({ file: currentFile, imageUrl: currentFile ? null : currentImageSource, cropBox: coords });
  });

  btnSearchFull.addEventListener('click', () => {
    executeSearch({ file: currentFile, imageUrl: currentFile ? null : currentImageSource, cropBox: null });
  });

  // Execute Search API
  async function executeSearch({ file, imageUrl, cropBox }) {
    cropStudioCard.style.display = 'none';
    searchLoader.style.display = 'block';
    resultsSection.style.display = 'none';
    searchLoader.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const formData = new FormData();
    if (file) {
      formData.append('file', file, file.name || 'query.jpg');
    } else if (imageUrl) {
      formData.append('image_url', imageUrl);
    }

    if (cropBox) {
      formData.append('crop_x', cropBox.x);
      formData.append('crop_y', cropBox.y);
      formData.append('crop_w', cropBox.width);
      formData.append('crop_h', cropBox.height);
    }
    formData.append('engine', 'all');

    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        body: formData
      });

      const resJson = await resp.json();

      if (!resJson.success) {
        throw new Error(resJson.error || 'Tìm kiếm thất bại');
      }

      const data = resJson.data;
      lastSearchData = data;
      allResults = data.results || [];

      // Update Engine Links
      if (data.engine_links) {
        if (data.engine_links.google) linkGoogle.href = data.engine_links.google;
        if (data.engine_links.bing) linkBing.href = data.engine_links.bing;
        if (data.engine_links.yandex) linkYandex.href = data.engine_links.yandex;
        if (data.engine_links.tineye) linkTinEye.href = data.engine_links.tineye;
      }

      // Update Tab Badges
      updateTabBadges(data);

      // Save to History
      saveToHistory({
        preview: data.image_preview || currentImageSource,
        total: data.total_results,
        timestamp: new Date().toISOString(),
        engineStats: data.engine_stats
      });

      // Render Results
      renderResults(allResults);

      searchLoader.style.display = 'none';
      resultsSection.style.display = 'block';
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

      showToast(`Đã tìm thấy ${allResults.length} kết quả từ các công cụ!`, 'success');
    } catch (err) {
      searchLoader.style.display = 'none';
      showToast(`Lỗi: ${err.message}`, 'error', 5000);
      console.error('Search error:', err);
    }
  }

  // Update Tab Badges
  function updateTabBadges(data) {
    const counts = { all: data.total_results || 0, google: 0, bing: 0, yandex: 0 };
    (data.results || []).forEach((r) => {
      const eng = r.engine ? r.engine.toLowerCase() : 'other';
      if (counts[eng] !== undefined) counts[eng]++;
    });

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      const target = btn.getAttribute('data-tab');
      const badge = btn.querySelector('.tab-badge');
      if (badge && counts[target] !== undefined) {
        badge.textContent = counts[target];
      }
    });
  }

  // Filter Tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentActiveTab = btn.getAttribute('data-tab');

      if (currentActiveTab === 'all') {
        renderResults(allResults);
      } else {
        const filtered = allResults.filter(
          (r) => r.engine && r.engine.toLowerCase() === currentActiveTab
        );
        renderResults(filtered);
      }
    });
  });

  // Render Result Cards
  function renderResults(results) {
    resultsGrid.innerHTML = '';
    resultsCount.textContent = `${results.length} kết quả`;

    if (!results || results.length === 0) {
      resultsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>Không tìm thấy kết quả phù hợp</h3>
          <p style="color:var(--text-muted); margin-top:0.4rem;">
            Hãy thử khoanh vùng đối tượng cụ thể hơn hoặc bấm vào nút <b>Google Lens / Bing</b> ở trên để tìm trực tiếp trên giao diện chính thức.
          </p>
        </div>
      `;
      return;
    }

    results.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'result-card';

      const engine = item.engine || 'google';
      const engineName = engine === 'google' ? 'Google Lens' : engine === 'bing' ? 'Bing Visual' : 'Yandex';
      const svgPlaceholder = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='200' viewBox='0 0 300 200'%3E%3Crect width='300' height='200' fill='%23121a2b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='sans-serif' font-size='13'%3EKh%C3%B4ng c%C3%B3 xem tr%C6%B0%E1%BB%9Bc%3C/text%3E%3C/svg%3E";
      const thumb = item.thumbnail || svgPlaceholder;
      const title = item.title || 'Visual Match';
      const domain = item.domain || 'Internet';
      const simPercent = Math.round((item.similarity || 0.85) * 100);
      const faviconUrl = domain.includes('.') ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
      const isFeatured = item.is_featured;

      if (isFeatured) {
        card.style.borderColor = 'rgba(66, 133, 244, 0.7)';
        card.style.background = 'linear-gradient(135deg, rgba(18, 26, 43, 0.85), rgba(66, 133, 244, 0.2))';
        card.style.boxShadow = '0 0 25px rgba(66, 133, 244, 0.25)';
      }

      card.innerHTML = `
        <div class="card-thumb-wrapper">
          <img src="${thumb}" alt="${escapeHtml(title)}" class="card-img" loading="lazy" onerror="this.src='${svgPlaceholder}'">
          <div class="card-tag ${engine}">
            <span class="engine-dot ${engine}"></span>
            ${isFeatured ? 'Google Lens LIVE' : engineName}
          </div>
          <div class="card-similarity">${simPercent}% khớp</div>
        </div>
        <div class="card-body">
          <div class="card-domain">
            ${faviconUrl ? `<img src="${faviconUrl}" class="domain-favicon" alt="" onerror="this.style.display='none'">` : ''}
            <span>${escapeHtml(domain)}</span>
          </div>
          <h4 class="card-title" title="${escapeHtml(title)}">${escapeHtml(title)}</h4>
          <div class="card-actions">
            ${isFeatured ? `
              <a href="${item.source_url || '#'}" target="_blank" rel="noopener noreferrer" class="card-btn" style="flex:2; background:rgba(66,133,244,0.25); border-color:#4285f4; color:#fff; font-weight:700;">
                <span>⚡</span> Mở trong Google Lens
              </a>
            ` : `
              <button class="card-btn btn-compare" data-idx="${index}">
                <span>🔍</span> So sánh
              </button>
              <a href="${item.source_url || '#'}" target="_blank" rel="noopener noreferrer" class="card-btn">
                <span>↗</span> Mở nguồn
              </a>
              <a href="${thumb}" target="_blank" download="found_image.jpg" class="card-btn" style="flex:0.5;">
                <span>↓</span>
              </a>
            `}
          </div>
        </div>
      `;

      resultsGrid.appendChild(card);
    });

    // Attach Compare Buttons
    document.querySelectorAll('.btn-compare').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        openComparisonModal(results[idx]);
      });
    });
  }

  // Lightbox Comparison Modal
  function openComparisonModal(item) {
    if (!item) return;

    const placeholder = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23121a2b'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-family='sans-serif' font-size='14'%3EKh%C3%B4ng c%C3%B3 xem tr%C6%B0%E1%BB%9Bc%3C/text%3E%3C/svg%3E";
    const queryThumb = lastSearchData?.image_preview || currentImageSource || placeholder;
    compareQueryImg.src = queryThumb;
    compareResultImg.src = item.thumbnail || placeholder;
    compareResultTitle.textContent = item.title || 'Kết quả tìm kiếm';

    compareSourceBtn.href = item.source_url || '#';
    compareDownloadBtn.href = item.thumbnail || item.source_url || '#';

    compareModal.style.display = 'flex';
  }

  btnCloseModal.addEventListener('click', () => {
    compareModal.style.display = 'none';
  });

  compareModal.addEventListener('click', (e) => {
    if (e.target === compareModal) {
      compareModal.style.display = 'none';
    }
  });

  // Export to JSON
  btnExportJson.addEventListener('click', () => {
    if (!allResults.length) {
      showToast('Không có kết quả nào để export', 'error');
      return;
    }
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allResults, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `omnilens_results_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('Đã tải xuống file JSON kết quả', 'success');
  });

  // Copy All Links
  btnCopyLinks.addEventListener('click', () => {
    if (!allResults.length) {
      showToast('Không có liên kết để copy', 'error');
      return;
    }
    const links = allResults
      .map((r, i) => `${i + 1}. [${r.title || 'Match'}] ${r.source_url || r.thumbnail}`)
      .join('\n');
    navigator.clipboard.writeText(links).then(() => {
      showToast('Đã sao chép toàn bộ links kết quả vào Clipboard!', 'success');
    });
  });

  // History Storage
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('omnilens_history') || '[]');
    } catch {
      return [];
    }
  }

  function saveToHistory(entry) {
    const hist = getHistory();
    hist.unshift(entry);
    // keep max 12 items
    if (hist.length > 12) hist.pop();
    localStorage.setItem('omnilens_history', JSON.stringify(hist));
    renderHistory();
  }

  function renderHistory() {
    const hist = getHistory();
    historyList.innerHTML = '';

    if (hist.length === 0) {
      historyList.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-dim);">
          Chưa có lịch sử tìm kiếm
        </div>
      `;
      return;
    }

    hist.forEach((h, idx) => {
      const card = document.createElement('div');
      card.className = 'history-card';
      const timeStr = new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <img src="${h.preview}" class="history-thumb" alt="History" onerror="this.src='data:image/svg+xml;charset=utf-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 50 50\'%3E%3Crect width=\'50\' height=\'50\' fill=\'%23121a2b\'/%3E%3C/svg%3E'">
        <div class="history-info">
          <div class="history-count">${h.total || 0} kết quả</div>
          <div class="history-time">${timeStr}</div>
        </div>
      `;

      card.addEventListener('click', () => {
        // Reload image to cropper
        historyDrawer.classList.remove('open');
        const img = new Image();
        img.onload = () => {
          loadAndDisplayImage(null, h.preview);
        };
        img.src = h.preview;
      });

      historyList.appendChild(card);
    });
  }

  btnOpenHistory.addEventListener('click', () => {
    renderHistory();
    historyDrawer.classList.add('open');
  });

  btnCloseHistory.addEventListener('click', () => {
    historyDrawer.classList.remove('open');
  });

  btnClearHistory.addEventListener('click', () => {
    localStorage.removeItem('omnilens_history');
    renderHistory();
    showToast('Đã xóa toàn bộ lịch sử', 'info');
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial render of history
  renderHistory();
});
