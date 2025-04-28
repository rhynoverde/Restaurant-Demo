/*  scripts.js  – Restaurant Demo  (Version r-1.0.0)
   ------------------------------------------------------------------ */

   const IMGBB_API_KEY = 'd44d592f97ef193ce535a799d00ef632';   // stays the same

   /* output image slugs */
   const TEMPLATE_URL        = 'https://my.reviewshare.pics/i/OQiNegOp2.png?';
   const REVIEW_TEMPLATE_URL = 'https://my.reviewshare.pics/i/QkVy57z8w.png?';
   
   /* share-link copied to clipboard */
   const SHARE_LINK = 'https://Sebs-Crescent-City-Bistro.embr.page';
   
   /* entrees used in this demo */
   const ENTREE_NAMES = [
     'Crescent City Shrimp and Grits',
     'Delta Blues Duck Breast',
     'Sweet Georgia Brown Bread Pudding',
     'The Bebop Blackened Salmon',
     'The Saxman’s Ribeye'
   ];
   
   /* optional generic text prefixes if you add more later */
   const GENERIC_PREFIXES = [
     'Something Yummy at',
     'My Lunch at',
     'Good Food from',
     'Enjoying a meal at',
     'Dining well at'
   ];
   
   /* image size constants (unchanged) */
   const FINAL_WIDTH   = 1080;
   const FINAL_HEIGHT  = 700;
   const ASPECT_RATIO  = FINAL_WIDTH / FINAL_HEIGHT;
   
   /* runtime state */
   let uploadedVehicleUrl = '';    // holds URL of entrée image (customer or gallery)
   let originalPhotoUrl   = '';    // raw (cropped) image used for Google-review modal
   let selectedEntree     = '';    // entree name if known
   let userReview         = '';
   let selectedRating     = 0;
   let cropper            = null;
   let cameraStream       = null;
   let currentCamera      = 'environment';
   let currentScale       = 1;
   
   /* ── tiny DOM helpers ────────────────────────────────────────────── */
   const $  = id  => document.getElementById(id);
   const qs = sel => document.querySelector(sel);
   const qa = sel => document.querySelectorAll(sel);
   
   /* ── generic helpers ─────────────────────────────────────────────── */
   async function uploadToImgbb(dataUrl){
     const res = await fetch('https://api.imgbb.com/1/upload',{
       method:'POST',
       body:new URLSearchParams({key:IMGBB_API_KEY,image:dataUrl.split(',')[1]})
     });
     if(!res.ok) throw new Error(await res.text());
     return (await res.json()).data.display_url;
   }
   
   function showStep(id){
     qa('.step').forEach(s=>s.classList.remove('active'));
     $(id).classList.add('active');
     if(id==='vehicleSharePage') updateShareImage();
   }
   
   /* ── loading overlay helpers ─────────────────────────────────────── */
   function showLoading(imgEl,text='Loading…'){
     const wrap=imgEl.parentElement;
     const ov=document.createElement('div');
     ov.className='loading-overlay';
     ov.textContent=text;
     wrap.style.position='relative';
     wrap.appendChild(ov);
     imgEl.addEventListener('load',()=>ov.remove(),{once:true});
   }
   
   /* ── customise / share-image generator ───────────────────────────── */
   function updateCustomizeRowVisibility(){
     $('customizeRow').style.display = selectedEntree ? 'none' : 'flex';
   }
   
   function updateHeadings(){
     const rfH = $('reviewFormHeading');
     const rsH = $('reviewShareHeading');
     if(selectedEntree){
       rfH.textContent = `Write a Quick Review of your ${selectedEntree} and Seb’s Crescent City Bistro`;
       rsH.textContent = `Share Your Review of ${selectedEntree} and Seb’s Crescent City Bistro`;
     }else{
       rfH.textContent = 'Write a Quick Review of your meal and Seb’s Crescent City Bistro';
       rsH.textContent = 'Share Your Review of your meal and Seb’s Crescent City Bistro';
     }
   }
   
   function buildShareQS(){
     const txt = selectedEntree || $('customTextSelect').value;
     const qs  = new URLSearchParams({
       custom_text_1 : txt,
       custom_image_1: uploadedVehicleUrl
     });
     return qs.toString();
   }
   
   function updateShareImage(){
     const img=$('vehicleShareImage');
     if(!uploadedVehicleUrl){ img.removeAttribute('src'); return; }
     const qsStr = buildShareQS();
     showLoading(img,'Updating…');
     img.src = TEMPLATE_URL + qsStr;
     updateHeadings();
     $('reviewPreviewImage').src = uploadedVehicleUrl;
     updateCustomizeRowVisibility();
   }
   
   /* ── star rating widget ─────────────────────────────────────────── */
   function initStarRating(){
     const stars = qa('#reviewStarRating span');
     const paint = v=>stars.forEach(s=>s.classList.toggle('selected',+s.dataset.value<=v));
     stars.forEach(st=>{
       const v = +st.dataset.value;
       st.onclick     = ()=>{selectedRating=v;paint(v)};
       st.onmouseover = ()=>paint(v);
       st.onmouseout  = ()=>paint(selectedRating);
     });
   }
   
   /* ── CAMERA + pinch-zoom (same as before) ───────────────────────── */
   const activePointers=new Map();
   function initPinchZoom(v){
     activePointers.clear();let startDist=0,startScale=currentScale;
     const zi=$('zoomIndicator');
     v.onpointerdown=e=>{
       activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
       if(activePointers.size===2){
         const [p1,p2]=activePointers.values();
         startDist=Math.hypot(p1.x-p2.x,p1.y-p2.y);startScale=currentScale;
       }
     };
     v.onpointermove=e=>{
       if(!activePointers.has(e.pointerId))return;
       activePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
       if(activePointers.size===2){
         const [p1,p2]=activePointers.values();
         const d=Math.hypot(p1.x-p2.x,p1.y-p2.y);
         currentScale=startScale*(d/startDist);
         v.style.transform=`scale(${currentScale})`;
         if(zi){zi.style.display='block';zi.textContent=d>startDist?'Zooming In…':'Zooming Out…';}
       }
     };
     ['pointerup','pointercancel'].forEach(evt=>v.addEventListener(evt,e=>{
       activePointers.delete(e.pointerId);
       if(activePointers.size<2&&zi) zi.style.display='none';
     }));
   }
   
   /* camera helpers (unchanged except wording) */
   function stopCamera(){
     if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
     const v=$('cameraPreview');if(v) v.srcObject=null;
   }
   function startCamera(){
     stopCamera();
     const v=$('cameraPreview');currentScale=1;if(v) v.style.transform='scale(1)';
     navigator.mediaDevices?.getUserMedia({video:{facingMode:currentCamera}})
       .then(st=>{cameraStream=st;v.srcObject=st;v.play();initPinchZoom(v);})
       .catch(()=>alert('Camera access denied or not available.'));
   }
   
   /* capture & crop logic (unchanged) */
   function captureFromCamera(){
     const v=$('cameraPreview');if(!v)return;
     const CW=2160,CH=1400;
     const full=document.createElement('canvas');full.width=CW;full.height=CH;
     const ctx=full.getContext('2d');
     const sc=Math.max(CW/v.videoWidth,CH/v.videoHeight);
     const w=v.videoWidth*sc,h=v.videoHeight*sc,dx=(CW-w)/2,dy=(CH-h)/2;
     ctx.drawImage(v,0,0,v.videoWidth,v.videoHeight,dx,dy,w,h);
     const crop=document.createElement('canvas');crop.width=FINAL_WIDTH;crop.height=FINAL_HEIGHT;
     crop.getContext('2d').drawImage(full,0,0,CW,CH,0,0,FINAL_WIDTH,FINAL_HEIGHT);
   
     originalPhotoUrl = crop.toDataURL('image/jpeg');
   
     stopCamera();
     showLoading($('vehicleShareImage'));
     uploadToImgbb(crop.toDataURL('image/jpeg'))
       .then(url=>{
         uploadedVehicleUrl=url;
         selectedEntree='';           // reset (user chose own photo)
         showStep('vehicleSharePage');
       })
       .catch(e=>alert(e));
   }
   
   function loadImageForCrop(src,isUrl=false){
     originalPhotoUrl = src;
     const img=$('cropImage');
     if(isUrl) img.crossOrigin='Anonymous';
     img.src=src;
     qa('.photo-section').forEach(s=>s.style.display='none');
     $('cropSection').style.display='block';
     cropper?.destroy();
     cropper=new Cropper(img,{aspectRatio:ASPECT_RATIO,viewMode:1,autoCropArea:0.8,dragMode:'move',
                              movable:true,zoomable:true,cropBoxResizable:false,cropBoxMovable:false});
   }
   
   /* QR helper (unchanged) */
   function showQRPage(){
     $('qrCodeImage').src='https://api.qrserver.com/v1/create-qr-code/?size=150x150&data='+encodeURIComponent('justshar.ing/xyz');
     showStep('qrSharePage');
   }
   
   /* char counter for review (unchanged) */
   function updateCharCount(){
     const ta = $('reviewText');
     const text = ta.value;
     const lineBreaks = (text.match(/\n/g) || []).length;
     const max = 230 - (lineBreaks*40);
     const left = max - text.length;
     const cc = $('charCount');
     cc.textContent = `${left} characters left`;
     cc.classList.toggle('red',left<=0);
     if(left<0){
       ta.value = text.slice(0,max);
       updateCharCount();
     }
   }
   
   /* ── DOMContentLoaded main block ─────────────────────────────────── */
   document.addEventListener('DOMContentLoaded',()=>{
   
     /* populate entrée dropdown */
     const sel = $('customTextSelect');
     ENTREE_NAMES.forEach(n=>{
       const o=document.createElement('option');
       o.value=n;o.textContent=n;
       sel.appendChild(o);
     });
   
     /* intro buttons */
     $('takePhotoButton').onclick=()=>{
       showStep('step2');
       $('photoOptions').style.display='none';
       qa('.photo-section').forEach(s=>s.style.display='none');
       $('takePhotoSection').style.display='block';
       startCamera();
     };
     $('uploadPhotoButton').onclick=()=>{
       showStep('step2');
       $('photoOptions').style.display='none';
       qa('.photo-section').forEach(s=>s.style.display='none');
       $('uploadPhotoSection').style.display='block';
     };
     $('galleryButton').onclick=()=>{showStep('galleryPage');};
   
     /* back from gallery */
     $('backFromGallery').onclick=()=>showStep('step1');
   
     /* gallery share buttons */
     qa('.share-entree-button').forEach(btn=>{
       btn.onclick=()=>{
         uploadedVehicleUrl = btn.dataset.image;
         selectedEntree     = btn.dataset.entree;
         originalPhotoUrl   = uploadedVehicleUrl;
         showStep('vehicleSharePage');
       };
     });
   
     /* step-2 inner options (unchanged) */
     qa('#photoOptions .photo-option').forEach(btn=>btn.onclick=()=>{
       $('photoOptions').style.display='none';
       qa('.photo-section').forEach(s=>s.style.display='none');
       const opt=btn.dataset.option;
       if(opt==='take'){ $('takePhotoSection').style.display='block';startCamera(); }
       else if(opt==='upload'){ $('uploadPhotoSection').style.display='block'; }
       else $('urlPhotoSection').style.display='block';
     });
     qa('.backToOptions').forEach(b=>b.onclick=()=>{
       stopCamera();
       $('photoOptions').style.display='block';
       qa('.photo-section').forEach(s=>s.style.display='none');
     });
   
     /* file / url handlers */
     $('uploadInput').onchange=e=>{
       const f=e.target.files[0]; if(!f) return;
       const r=new FileReader();
       r.onload=ev=>loadImageForCrop(ev.target.result);
       r.readAsDataURL(f);
     };
     $('loadUrlImage').onclick=()=>{
       const u=$('imageUrlInput').value.trim();
       if(!u) return alert('Enter a valid URL');
       loadImageForCrop(u,true);
     };
   
     /* camera buttons */
     $('capturePhoto').onclick=captureFromCamera;
     $('swapCamera').onclick=()=>{currentCamera=currentCamera==='environment'?'user':'environment';startCamera();};
     $('flashToggle').onclick=e=>{
       if(!cameraStream) return;
       const track=cameraStream.getVideoTracks()[0];
       if(!track.getCapabilities().torch) return;
       const on=e.currentTarget.classList.toggle('flash-on');
       track.applyConstraints({advanced:[{torch:on}]});
     };
   
     /* crop buttons */
     $('cropButton').onclick=()=>{
       if(!cropper) return;
       const cnv=cropper.getCroppedCanvas({width:FINAL_WIDTH,height:FINAL_HEIGHT});
       cropper.destroy();cropper=null;
       showLoading($('vehicleShareImage'));
       uploadToImgbb(cnv.toDataURL('image/jpeg'))
         .then(url=>{
           uploadedVehicleUrl=url;
           selectedEntree='';        /* user will choose via dropdown */
           showStep('vehicleSharePage');
         })
         .catch(e=>alert(e));
     };
     $('fitEntireButton').onclick=()=>{
       const src=uploadedVehicleUrl||$('cropImage').src;
       if(!src) return;
       const img=new Image();img.crossOrigin='Anonymous';
       img.onload=()=>{
         const cnv=document.createElement('canvas');cnv.width=FINAL_WIDTH;cnv.height=FINAL_HEIGHT;
         const ctx=cnv.getContext('2d');
         const scC=Math.max(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
         ctx.filter='blur(40px)';
         ctx.drawImage(img,(FINAL_WIDTH-img.width*scC)/2,(FINAL_HEIGHT-img.height*scC)/2,img.width*scC,img.height*scC);
         ctx.filter='none';
         const scF=Math.min(FINAL_WIDTH/img.width,FINAL_HEIGHT/img.height);
         ctx.drawImage(img,(FINAL_WIDTH-img.width*scF)/2,(FINAL_HEIGHT-img.height*scF)/2,img.width*scF,img.height*scF);
         showLoading($('vehicleShareImage'));
         uploadToImgbb(cnv.toDataURL('image/jpeg'))
           .then(url=>{
             uploadedVehicleUrl=url;
             selectedEntree='';
             showStep('vehicleSharePage');
           })
           .catch(e=>alert(e));
       };
       img.src=src;
     };
     $('changePhoto').onclick=()=>{stopCamera();$('photoOptions').style.display='block';qa('.photo-section').forEach(s=>s.style.display='none');};
   
     /* customise select events */
     $('customTextSelect').onchange=()=>updateShareImage();
   
     /* apply button (only shown if you add custom field) */
     $('applyTextButton').onclick=updateShareImage;
   
     /* entrée share page buttons */
     $('shareNowButton').onclick=async ()=>{
       try{
         await navigator.clipboard.writeText(SHARE_LINK);
         Swal.fire({
           title:'Link Copied!',
           html:`<p>The Seb’s Crescent City Bistro link was saved to your clipboard.</p>
                 <p style="margin-top:15px;">Paste it wherever you share your image!</p>`,
           icon:'success',
           confirmButtonText:'Got it, Share Image Now!',
           allowOutsideClick:false
         }).then(async res=>{
           if(res.isConfirmed && navigator.share){
             const blob=await (await fetch($('vehicleShareImage').src)).blob();
             await navigator.share({files:[new File([blob],'entree.jpg',{type:blob.type})]});
           }
         });
       }catch{alert('Failed to copy link');}
     };
     $('forwardFromVehicleShare').onclick=()=>{showStep('reviewFormPage');initStarRating();};
     $('backFromVehicleShare').onclick=()=>{
       if(cameraStream) showStep('step2'); else showStep('step1');
     };
   
     /* review form */
     $('reviewText').addEventListener('input',updateCharCount);
     updateCharCount();
     initStarRating();
     $('submitReviewForm').onclick=()=>{
       const rev=$('reviewText').value.trim();
       const nm =$(`reviewerName`).value.trim();
       if(selectedRating===0) return alert('Please select a star rating.');
       if(!rev) return alert('Please enter a review.');
       if(!nm)  return alert('Please enter your name.');
       userReview=rev;
       const img=$('reviewShareImage');
       showLoading(img);
       img.src=REVIEW_TEMPLATE_URL+
               'first_name='+encodeURIComponent(nm)+
               '&job_title='+encodeURIComponent(rev);
       showStep('reviewSharePage');
     };
     $('backFromReviewForm').onclick=()=>showStep('vehicleSharePage');
   
     /* review share */
     $('reviewShareButton').onclick=async ()=>{
       try{
         await navigator.clipboard.writeText(SHARE_LINK);
         Swal.fire({
           title:'Link Copied!',
           html:`<p>The Seb’s Crescent City Bistro link was saved to your clipboard.</p>`,
           icon:'success',
           confirmButtonText:'Got it, Share Image Now!',
           allowOutsideClick:false
         }).then(async res=>{
           if(res.isConfirmed && navigator.share){
             const blob=await (await fetch($('reviewShareImage').src)).blob();
             await navigator.share({files:[new File([blob],'review.jpg',{type:blob.type})]});
           }
         });
       }catch{alert('Failed to copy link');}
     };
     $('forwardFromReviewShare').onclick=()=>showStep('googleReviewPage');
     $('backFromReviewShare').onclick=()=>{showStep('reviewFormPage');initStarRating();};
   
     /* google review */
     $('googleReviewButton').onclick=async ()=>{
       try{
         const reviewTxt = $('finalReviewText').value.trim() || $('reviewText').value.trim();
         if(reviewTxt) await navigator.clipboard.writeText(reviewTxt);
   
         Swal.fire({
           title:'Post Your Review on Google!',
           html:`<p>You can save your image to your photos to attach to your review.</p>
                 <img src="https://f000.backblazeb2.com/file/EmbrFyr/Instructional-Images/LongPressSaveToPhotos.jpg"
                      alt="Save to Photos Instruction"
                      style="margin:15px auto;display:block;max-width:50%;border-radius:10px;box-shadow:0 0 8px rgba(0,0,0,0.15);">
                 <ol style="text-align:left;margin-top:15px;">
                   <li>Select your star rating</li>
                   <li>Paste your review</li>
                   <li>Add photo(s) (optional but appreciated)</li>
                   <li>Tap Post</li>
                 </ol>
                 <p><strong>That’s it!</strong></p>`,
           confirmButtonText:'Got it, Paste Google Review',
           allowOutsideClick:false
         }).then(()=>window.open('https://search.google.com/local/writereview?placeid=ChIJFRctSC6LMW0Rd0T5nvajzPw','_blank'));
       }catch(err){alert('Failed to copy review');}
     };
     $('backFromGoogleReview').onclick=()=>showStep('reviewSharePage');
     $('forwardFromGoogleReview').onclick=()=>showStep('finalOptionsPage');
   
     /* final options sync */
     const syncFinal=()=>{
       if(!$('finalOptionsPage').classList.contains('active')) return;
       $('finalVehicleShareImage').src = $('vehicleShareImage').src;
       $('finalReviewShareImage').src  = $('reviewShareImage').src;
       $('finalReviewText').value      = userReview;
     };
     new MutationObserver(syncFinal).observe(document.body,{attributes:true,attributeFilter:['class'],subtree:true});
   
     /* initial share-image update */
     updateShareImage();
   });
   