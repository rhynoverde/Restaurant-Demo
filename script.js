// script.js

// === CONFIGURATION ===
const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632';
const FINAL_WIDTH = 1080;
const FINAL_HEIGHT = 700;
const ASPECT_RATIO = FINAL_WIDTH / FINAL_HEIGHT; // ≈1.542857

// === GLOBAL STATE ===
let originalCapturedDataUrl = "";
let croppedDataUrl = "";
let cropper = null;
let cameraStream = null;
let activePointers = new Map();
let currentCamera = "environment";
let currentScale = 1;
let userReview = "";
let selectedRating = 0;
let uploadedImageUrl = "";

// =======================
// UTILITY FUNCTIONS
// =======================
function dataURLtoBlob(dataurl) {
  const parts = dataurl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return new Blob([arr], { type: mime });
}

async function uploadToImgbb(dataUrl) {
  const base64Image = dataUrl.split(',')[1];
  const formData = new FormData();
  formData.append('image', base64Image);
  formData.append('key', IMGBB_API_KEY);
  
  const response = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('Upload to imgbb failed: ' + errorText);
  }
  const result = await response.json();
  return result.data.display_url;
}

function showStep(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');

  // Populate final options when showing that page
  if (id === 'finalOptionsPage') {
    const finalDishImg = document.getElementById('finalVehicleShareImage');
    const dishImg = document.getElementById('vehicleShareImage');
    if (dishImg && finalDishImg) finalDishImg.src = dishImg.src;
    const finalReviewImg = document.getElementById('finalReviewShareImage');
    const reviewImg = document.getElementById('reviewShareImage');
    if (reviewImg && finalReviewImg) finalReviewImg.src = reviewImg.src;
    const finalReviewTextElem = document.getElementById('finalReviewText');
    if (finalReviewTextElem) finalReviewTextElem.value = userReview;
  }
}

function hideAllPhotoSections() {
  document.querySelectorAll('.photo-section').forEach(s => s.style.display = 'none');
}

function resetPhotoProcess() {
  stopCamera();
  hideAllPhotoSections();
  if (cropper) { cropper.destroy(); cropper = null; }
  originalCapturedDataUrl = "";
  croppedDataUrl = "";
  uploadedImageUrl = "";
  const up = document.getElementById('uploadInput');
  if (up) up.value = "";
}

function initStarRating() {
  const starContainer = document.getElementById('reviewStarRating');
  if (!starContainer) return;
  const stars = starContainer.querySelectorAll('span');
  stars.forEach(star => {
    star.onclick = () => {
      selectedRating = parseInt(star.dataset.value);
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= selectedRating) s.classList.add('selected');
        else s.classList.remove('selected');
      });
    };
    star.onmouseover = () => {
      const hoverValue = parseInt(star.dataset.value);
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= hoverValue) s.classList.add('selected');
        else s.classList.remove('selected');
      });
    };
    star.onmouseout = () => {
      stars.forEach(s => {
        if (parseInt(s.dataset.value) <= selectedRating) s.classList.add('selected');
        else s.classList.remove('selected');
      });
    };
  });
}

// =======================
// CAMERA & IMAGE FUNCTIONS
// =======================
function initPinchZoom(video) {
  activePointers.clear();
  let initialDistance = 0, initialScale = currentScale;
  const zoomIndicator = document.getElementById('zoomIndicator');

  video.onpointerdown = e => {
    e.preventDefault();
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      initialDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialScale = currentScale;
    }
  };
  video.onpointermove = e => {
    e.preventDefault();
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 2) {
      const pts = Array.from(activePointers.values());
      const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      currentScale = initialScale * (newDist / initialDistance);
      video.style.transform = `scale(${currentScale})`;
      if (zoomIndicator) {
        zoomIndicator.style.display = 'block';
        zoomIndicator.innerText = newDist > initialDistance ? 'Zooming In…' : 'Zooming Out…';
      }
    }
  };
  ['pointerup','pointercancel'].forEach(evt => {
    video.addEventListener(evt, e => {
      e.preventDefault();
      activePointers.delete(e.pointerId);
      if (activePointers.size < 2 && zoomIndicator) zoomIndicator.style.display = 'none';
    });
  });
}

function startCamera() {
  const video = document.getElementById('cameraPreview');
  currentScale = 1;
  if (video) video.style.transform = 'scale(1)';
  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: currentCamera } })
      .then(stream => {
        cameraStream = stream;
        video.srcObject = stream;
        initPinchZoom(video);
      })
      .catch(() => alert('Camera access denied or not available.'));
  }
}

function stopCamera() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach(t => t.stop());
  cameraStream = null;
}

// Capture + crop to final dimensions, then upload & show share screen
function captureFromCamera() {
  const video = document.getElementById('cameraPreview');
  if (!video) return;
  const CAPTURE_WIDTH = 2160, CAPTURE_HEIGHT = 1400;
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = CAPTURE_WIDTH;
  fullCanvas.height = CAPTURE_HEIGHT;
  const ctx = fullCanvas.getContext('2d');
  const scale = Math.max(CAPTURE_WIDTH / video.videoWidth, CAPTURE_HEIGHT / video.videoHeight);
  const nw = video.videoWidth * scale, nh = video.videoHeight * scale;
  ctx.drawImage(video, (CAPTURE_WIDTH - nw)/2, (CAPTURE_HEIGHT - nh)/2, nw, nh);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = FINAL_WIDTH;
  cropCanvas.height = FINAL_HEIGHT;
  const cctx = cropCanvas.getContext('2d');
  cctx.drawImage(fullCanvas, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT, 0, 0, FINAL_WIDTH, FINAL_HEIGHT);

  stopCamera();
  croppedDataUrl = cropCanvas.toDataURL('image/jpeg');
  uploadToImgbb(croppedDataUrl)
    .then(url => {
      uploadedImageUrl = url;
      document.getElementById('vehicleShareImage').src =
        `https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=${encodeURIComponent(url)}`;
      showStep('vehicleSharePage');
    })
    .catch(err => alert(err));
}

function loadImageForCrop(src) {
  originalCapturedDataUrl = src;
  const img = document.getElementById('cropImage');
  img.crossOrigin = "Anonymous";
  img.src = src;
  hideAllPhotoSections();
  document.getElementById('cropSection').style.display = 'block';
  if (cropper) cropper.destroy();
  cropper = new Cropper(img, {
    aspectRatio: ASPECT_RATIO,
    viewMode: 1,
    autoCropArea: 0.8,
    dragMode: 'move',
    zoomable: true,
    cropBoxResizable: false,
    cropBoxMovable: false
  });
}

// =======================
// EVENT LISTENERS SETUP
// =======================
document.addEventListener('DOMContentLoaded', () => {
  // Photo options
  document.querySelectorAll('.photo-option').forEach(btn => {
    btn.onclick = () => {
      hideAllPhotoSections();
      document.getElementById('photoOptions').style.display = 'none';
      const opt = btn.dataset.option;
      if (opt === 'take') {
        document.getElementById('takePhotoSection').style.display = 'block';
        startCamera();
      } else {
        document.getElementById('uploadPhotoSection').style.display = 'block';
      }
    };
  });

  // Back to options
  document.querySelectorAll('.backToOptions').forEach(btn => {
    btn.onclick = () => {
      resetPhotoProcess();
      document.getElementById('photoOptions').style.display = 'block';
    };
  });

  // Upload input
  document.getElementById('uploadInput').onchange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => loadImageForCrop(ev.target.result);
    reader.readAsDataURL(file);
  };

  // Capture from camera
  document.getElementById('capturePhoto').onclick = captureFromCamera;

  // Swap camera
  document.getElementById('swapCamera').onclick = () => {
    currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
    stopCamera();
    startCamera();
  };

  // Flash toggle
  document.getElementById('flashToggle').onclick = e => {
    const btn = e.currentTarget;
    if (!cameraStream) return;
    const [track] = cameraStream.getVideoTracks();
    if (!track.getCapabilities().torch) return;
    const on = btn.classList.toggle('flash-on');
    track.applyConstraints({ advanced: [{ torch: on }] });
  };

  // Crop button
  document.getElementById('cropButton').onclick = () => {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas({ width: FINAL_WIDTH, height: FINAL_HEIGHT });
    croppedDataUrl = canvas.toDataURL('image/jpeg');
    cropper.destroy();
    uploadToImgbb(croppedDataUrl)
      .then(url => {
        uploadedImageUrl = url;
        document.getElementById('vehicleShareImage').src =
          `https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=${encodeURIComponent(url)}`;
        showStep('vehicleSharePage');
      })
      .catch(err => alert(err));
  };

  // Fit entire image
  document.getElementById('fitEntireButton').onclick = () => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = FINAL_WIDTH;
      canvas.height = FINAL_HEIGHT;
      const ctx = canvas.getContext('2d');
      const scaleCover = Math.max(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
      const coverWidth = img.width * scaleCover, coverHeight = img.height * scaleCover;
      const coverDx = (FINAL_WIDTH - coverWidth) / 2, coverDy = (FINAL_HEIGHT - coverHeight) / 2;
      const scaleFit = Math.min(FINAL_WIDTH / img.width, FINAL_HEIGHT / img.height);
      const fitWidth = img.width * scaleFit, fitHeight = img.height * scaleFit;
      const fitDx = (FINAL_WIDTH - fitWidth) / 2, fitDy = (FINAL_HEIGHT - fitHeight) / 2;
      ctx.filter = 'blur(40px)';
      ctx.drawImage(img, coverDx, coverDy, coverWidth, coverHeight);
      ctx.filter = 'none';
      ctx.drawImage(img, fitDx, fitDy, fitWidth, fitHeight);
      croppedDataUrl = canvas.toDataURL('image/jpeg');
      uploadToImgbb(croppedDataUrl)
        .then(url => {
          uploadedImageUrl = url;
          document.getElementById('vehicleShareImage').src =
            `https://my.reviewshare.pics/i/mpbPVerBH.png?custom_image_1=${encodeURIComponent(url)}`;
          showStep('vehicleSharePage');
        })
        .catch(err => alert(err));
    };
    img.src = originalCapturedDataUrl || croppedDataUrl;
  };

  // Change photo
  document.getElementById('changePhoto').onclick = () => {
    resetPhotoProcess();
    document.getElementById('photoOptions').style.display = 'block';
  };

  // Share dish image
  document.getElementById('shareNowButton').onclick = async () => {
    const shareLink = window.location.href;
    try {
      await navigator.clipboard.writeText(shareLink);
      await Swal.fire({
        title: 'Link Copied!',
        html: `
          <p>Your link has been copied. Now share your dish photo and link with your friends!</p>
          <ul style="text-align:left;">
            <li>😊 Paste it in your Instagram Story.</li>
            <li>😃 Paste it in your Facebook post.</li>
            <li>😁 Use it in your Twitter or TikTok bio.</li>
          </ul>
        `,
        icon: 'success'
      });
    } catch {
      alert('Failed to copy link: ' + shareLink);
    }
  };

  // Next to review form
  document.getElementById('forwardFromVehicleShare').onclick = () => {
    showStep('reviewFormPage');
    initStarRating();
  };

  // Back to photo step
  document.getElementById('backFromVehicleShare').onclick = () => {
    resetPhotoProcess();
    showStep('step1');
  };

  // Submit review
  document.getElementById('submitReviewForm').onclick = () => {
    const txt = document.getElementById('reviewText').value.trim();
    if (!txt) return alert('Please enter your review.');
    userReview = txt;
    const reviewShareUrl = 
      `https://my.reviewshare.pics/i/pGdj8g8st.png?first_name=${encodeURIComponent(txt)}&job_title=${encodeURIComponent(txt)}`;
    document.getElementById('reviewShareImage').src = reviewShareUrl;
    showStep('reviewSharePage');
  };

  // Back from review form
  document.getElementById('backFromReviewForm').onclick = () => {
    showStep('vehicleSharePage');
  };

  // Share review image
  document.getElementById('reviewShareButton').onclick = async () => {
    const shareLink = window.location.href;
    try {
      await navigator.clipboard.writeText(shareLink);
      await Swal.fire({
        title: 'Link Copied!',
        html: '<p>Your link has been copied. Share your review image now!</p>',
        icon: 'success'
      });
    } catch {
      alert('Failed to copy link: ' + shareLink);
    }
  };

  // Next to Google review
  document.getElementById('forwardFromReviewShare').onclick = () => {
    showStep('googleReviewPage');
  };

  // Back from review share
  document.getElementById('backFromReviewShare').onclick = () => {
    showStep('reviewFormPage');
    initStarRating();
  };

  // Google review button
  document.getElementById('googleReviewButton').onclick = async () => {
    try {
      await navigator.clipboard.writeText(userReview);
      await Swal.fire({
        title: 'Review Copied!',
        html: '<p>Your review text has been copied. Please paste it on our Google profile.</p>',
        icon: 'info',
        confirmButtonText: 'Go to Google'
      });
      window.open('https://search.google.com/local/writereview', '_blank');
      showStep('finalOptionsPage');
    } catch {
      alert('Failed to copy review text.');
    }
  };

  // Back from Google review
  document.getElementById('backFromGoogleReview').onclick = () => {
    showStep('reviewSharePage');
  };

  // Next from Google review
  document.getElementById('forwardFromGoogleReview').onclick = () => {
    showStep('finalOptionsPage');
  };

  // Share final dish
  document.getElementById('shareVehicleFinalButton').onclick = document.getElementById('shareNowButton').onclick;

  // Share final review
  document.getElementById('shareReviewFinalButton').onclick = document.getElementById('reviewShareButton').onclick;

  // Copy final review text
  document.getElementById('copyReviewText').onclick = () => {
    const txt = document.getElementById('finalReviewText').value;
    navigator.clipboard.writeText(txt).then(() => alert('Review text copied.'));
  };

  // Back from final options
  document.getElementById('backFromFinalOptions').onclick = () => {
    showStep('googleReviewPage');
  };
});
