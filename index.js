const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { createCanvas, loadImage } = require('canvas');

const app = express();
const PORT = process.env.PORT || 3000;

// Create directories
const cacheDir = path.join(__dirname, 'cache');
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync('uploads/')) fs.mkdirSync('uploads/');

// ========== TOOL FUNCTIONS ==========

// 1. Image to Cartoon
async function toCartoon(imagePath, style) {
    const img = await Jimp.read(imagePath);
    if (style === 'disney') {
        img.normalize().contrast(0.2).brightness(0.1);
    } else if (style === 'anime') {
        img.contrast(0.3).brightness(0.05).normalize();
    } else if (style === 'comic') {
        img.contrast(0.25).posterize(8).brightness(0.1);
    } else if (style === 'sketch') {
        img.greyscale().contrast(0.3).brightness(0.05);
    } else if (style === 'watercolor') {
        img.blur(3).brightness(0.15).contrast(0.1);
    }
    const outPath = path.join(cacheDir, `cartoon_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// 2. Face Swap (simple version)
async function faceSwap(image1Path, image2Path) {
    const img1 = await Jimp.read(image1Path);
    const img2 = await Jimp.read(image2Path);
    
    // Detect face region (center area approximation)
    const faceX = Math.floor(img1.bitmap.width * 0.25);
    const faceY = Math.floor(img1.bitmap.height * 0.2);
    const faceW = Math.floor(img1.bitmap.width * 0.5);
    const faceH = Math.floor(img1.bitmap.height * 0.5);
    
    // Resize second image face to fit
    img2.resize(faceW, faceH);
    
    // Composite face onto first image
    img1.composite(img2, faceX, faceY);
    
    const outPath = path.join(cacheDir, `faceswap_${Date.now()}.png`);
    await img1.writeAsync(outPath);
    return outPath;
}

// 3. Remove Watermark
async function removeWatermark(imagePath) {
    const img = await Jimp.read(imagePath);
    // Apply blur to remove watermark
    img.blur(5);
    const outPath = path.join(cacheDir, `nowatermark_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// 4. Image to Sketch/Pencil
async function toSketch(imagePath) {
    const img = await Jimp.read(imagePath);
    img.greyscale().contrast(0.4).brightness(0.1);
    const outPath = path.join(cacheDir, `sketch_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// 5. Remove Background (simple)
async function removeBackground(imagePath) {
    const img = await Jimp.read(imagePath);
    // Create mask for subject (center keep, edges remove)
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const mask = new Jimp(width, height, 0x00000000);
    
    // Keep center region
    const centerX = width * 0.2;
    const centerY = height * 0.2;
    const centerW = width * 0.6;
    const centerH = height * 0.6;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x > centerX && x < centerX + centerW && y > centerY && y < centerY + centerH) {
                mask.setPixelColor(0xFFFFFFFF, x, y);
            }
        }
    }
    
    img.mask(mask, 0, 0);
    const outPath = path.join(cacheDir, `nobg_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// 6. Change Background
async function changeBackground(imagePath, bgType) {
    const img = await Jimp.read(imagePath);
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    
    let bgImage;
    if (bgType === 'beach') {
        bgImage = new Jimp(width, height, 0x87CEEB); // Sky blue
    } else if (bgType === 'forest') {
        bgImage = new Jimp(width, height, 0x228B22); // Forest green
    } else if (bgType === 'city') {
        bgImage = new Jimp(width, height, 0x808080); // City grey
    } else if (bgType === 'romantic') {
        bgImage = new Jimp(width, height, 0xFF69B4); // Hot pink
    } else {
        bgImage = new Jimp(width, height, 0xFFFFFF); // White
    }
    
    // Composite subject on new background
    bgImage.composite(img, 0, 0);
    const outPath = path.join(cacheDir, `newbg_${Date.now()}.png`);
    await bgImage.writeAsync(outPath);
    return outPath;
}

// 7. Add Boyfriend/Girlfriend to Photo
async function addPartner(imagePath, partnerType) {
    const mainImg = await Jimp.read(imagePath);
    const width = mainImg.bitmap.width;
    const height = mainImg.bitmap.height;
    
    // Create partner frame
    const partnerImg = new Jimp(150, 150, partnerType === 'boyfriend' ? 0x4169E1 : 0xFF69B4);
    
    // Add heart effect
    for (let i = 0; i < 20; i++) {
        const x = Math.random() * 150;
        const y = Math.random() * 150;
        partnerImg.setPixelColor(0xFF0000, x, y);
    }
    
    // Position partner at bottom right
    const posX = width - 170;
    const posY = height - 170;
    mainImg.composite(partnerImg, posX, posY);
    
    // Add "Love" text
    const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    mainImg.print(font, posX + 40, posY + 170, partnerType === 'boyfriend' ? '💙 MY BOYFRIEND 💙' : '💖 MY GIRLFRIEND 💖');
    
    const outPath = path.join(cacheDir, `withpartner_${Date.now()}.png`);
    await mainImg.writeAsync(outPath);
    return outPath;
}

// 8. Merge Photos (make it look like real couple photo)
async function mergePhotos(image1Path, image2Path) {
    const img1 = await Jimp.read(image1Path);
    const img2 = await Jimp.read(image2Path);
    
    const width = Math.max(img1.bitmap.width, img2.bitmap.width);
    const height = Math.max(img1.bitmap.height, img2.bitmap.height);
    
    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    
    // Load images to canvas
    const canvasImg1 = await loadImage(image1Path);
    const canvasImg2 = await loadImage(image2Path);
    
    ctx.drawImage(canvasImg1, 0, 0, width/2, height);
    ctx.drawImage(canvasImg2, width/2, 0, width/2, height);
    
    // Add heart between them
    ctx.font = '50px Arial';
    ctx.fillStyle = '#FF0000';
    ctx.fillText('❤️', width/2 - 30, height/2);
    
    // Save canvas as buffer
    const buffer = canvas.toBuffer();
    const outPath = path.join(cacheDir, `merged_${Date.now()}.png`);
    fs.writeFileSync(outPath, buffer);
    
    return outPath;
}

// 9. Image to Oil Painting
async function toOilPainting(imagePath) {
    const img = await Jimp.read(imagePath);
    img.blur(3).contrast(0.2).brightness(0.1);
    const outPath = path.join(cacheDir, `painting_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// 10. Image to Pencil Drawing
async function toPencil(imagePath) {
    const img = await Jimp.read(imagePath);
    img.greyscale().contrast(0.5).brightness(0.15);
    const outPath = path.join(cacheDir, `pencil_${Date.now()}.png`);
    await img.writeAsync(outPath);
    return outPath;
}

// HTML
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>👑 MISS ALIYA PHOTO STUDIO 👑</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Poppins',sans-serif;background:radial-gradient(circle at 0% 0%,#0a0a2a,#1a1a3a,#0d0d2b);min-height:100vh;}
.welcome-screen{position:fixed;top:0;left:0;width:100%;height:100%;background:#0a0a2a;z-index:1000;display:flex;align-items:center;justify-content:center;animation:fadeOut 3s ease forwards 2s;}
@keyframes fadeOut{0%,70%{opacity:1}100%{opacity:0;visibility:hidden}}
.welcome-card{text-align:center;animation:zoomIn 0.6s ease;}
@keyframes zoomIn{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
.sliding-name{font-size:3rem;font-family:'Orbitron',monospace;background:linear-gradient(135deg,#FFD700,#FF6B6B,#FFB347);-webkit-background-clip:text;background-clip:text;color:transparent;animation:slideIn 1s ease-out;}
@keyframes slideIn{from{transform:translateX(-100%);opacity:0}to{transform:translateX(0);opacity:1}}
.owner-img{width:130px;height:130px;border-radius:50%;border:3px solid #FFD700;margin:20px auto;object-fit:cover;box-shadow:0 0 30px rgba(255,215,0,0.5);animation:float 3s infinite;}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
.main-content{opacity:0;animation:fadeMain 0.5s ease forwards 2.2s;}
@keyframes fadeMain{to{opacity:1}}
.container{max-width:1400px;margin:0 auto;padding:20px}
.header{text-align:center;margin-bottom:30px}
.header h1{font-size:2.5rem;font-family:'Orbitron',monospace;background:linear-gradient(135deg,#FFD700,#FF6B6B);-webkit-background-clip:text;background-clip:text;color:transparent}
.tool-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:15px;margin:30px 0}
.tool-card{background:#1f1f3f;border:2px solid rgba(255,215,0,0.3);border-radius:20px;padding:20px;text-align:center;cursor:pointer;transition:0.3s}
.tool-card:hover{transform:translateY(-5px);border-color:#FFD700;box-shadow:0 0 20px rgba(255,215,0,0.3)}
.tool-card.selected{background:linear-gradient(135deg,#FFD700,#FF6B6B);border-color:white}
.tool-card i{font-size:2rem;color:#FFD700;margin-bottom:10px}
.tool-card.selected i{color:#0a0a2a}
.tool-card h3{color:white;font-size:0.9rem}
.tool-card.selected h3{color:#0a0a2a}
.preview-area{background:#1a1a3a;border-radius:30px;padding:25px;margin:20px 0;border:1px solid rgba(255,215,0,0.3)}
.preview-box{background:rgba(0,0,0,0.4);border-radius:20px;min-height:300px;display:flex;align-items:center;justify-content:center;border:2px dashed rgba(255,215,0,0.5);flex-wrap:wrap;gap:20px}
.preview-image{max-width:45%;max-height:250px;border-radius:15px;border:2px solid #FFD700}
.upload-area{background:#1f1f3f;border-radius:20px;padding:30px;text-align:center;cursor:pointer;border:2px dashed rgba(255,215,0,0.4);margin:20px 0;transition:0.3s}
.upload-area:hover{border-color:#FFD700;transform:scale(1.01)}
.upload-area i{font-size:3rem;color:#FFD700}
.double-upload{display:flex;gap:20px;margin:20px 0;flex-wrap:wrap}
.upload-box{flex:1;background:#1f1f3f;border-radius:20px;padding:20px;text-align:center;cursor:pointer;border:2px dashed rgba(255,215,0,0.4)}
.upload-box i{font-size:2rem;color:#FFD700}
.glow-button{width:100%;background:linear-gradient(135deg,#FFD700,#FF6B6B);border:none;padding:18px;border-radius:50px;color:#0a0a2a;font-weight:800;font-size:1.2rem;cursor:pointer;font-family:'Orbitron',monospace;margin-top:20px}
.glow-button:disabled{opacity:0.5;cursor:not-allowed}
.result-card{margin-top:30px;background:#1a1a3a;border-radius:25px;padding:25px;text-align:center;border:1px solid #FFD700;display:none}
.result-image{max-width:100%;border-radius:15px;margin:15px 0;border:3px solid #FFD700}
.download-btn{display:inline-flex;align-items:center;gap:10px;background:#4CAF50;color:white;padding:12px 30px;border-radius:50px;text-decoration:none}
.loading{display:none;text-align:center;padding:30px}
.spinner{width:50px;height:50px;border:4px solid rgba(255,215,0,0.3);border-top-color:#FFD700;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto}
@keyframes spin{to{transform:rotate(360deg)}}
.status{text-align:center;margin:15px;color:#FFD700}
.style-options{display:flex;gap:10px;justify-content:center;margin:15px 0;flex-wrap:wrap}
.style-btn{background:#1f1f3f;border:1px solid #FFD700;padding:8px 15px;border-radius:20px;color:white;cursor:pointer}
.style-btn.active{background:linear-gradient(135deg,#FFD700,#FF6B6B);color:#0a0a2a}
.footer{text-align:center;margin-top:40px;color:rgba(255,215,0,0.5)}
@media(max-width:768px){.sliding-name{font-size:1.8rem}.tool-grid{grid-template-columns:repeat(2,1fr)}.preview-image{max-width:100%}}
</style>
</head>
<body>
<div class="welcome-screen"><div class="welcome-card"><img src="https://i.ibb.co/rG46PWKB/file-00000000d27471fa8382db8cabb463b2.png" class="owner-img"><div class="sliding-name">👑 MISS ALIYA 👑</div><h3 style="color:#FFD700">✦ PHOTO STUDIO PRO ✦</h3><p style="color:white">10+ Amazing Photo Tools</p></div></div>
<div class="main-content"><div class="container"><div class="header"><h1><i class="fas fa-camera"></i> MISS ALIYA PHOTO STUDIO <i class="fas fa-camera"></i></h1></div>
<div class="tool-grid" id="toolGrid">
<div class="tool-card" data-tool="cartoon"><i class="fas fa-mickey"></i><h3>🎭 Cartoon</h3></div>
<div class="tool-card" data-tool="faceswap"><i class="fas fa-exchange-alt"></i><h3>🔄 Face Swap</h3></div>
<div class="tool-card" data-tool="removewatermark"><i class="fas fa-tint-slash"></i><h3>🚫 Watermark Remove</h3></div>
<div class="tool-card" data-tool="sketch"><i class="fas fa-pencil-alt"></i><h3>✏️ Sketch</h3></div>
<div class="tool-card" data-tool="removebg"><i class="fas fa-eraser"></i><h3>✨ BG Remove</h3></div>
<div class="tool-card" data-tool="boyfriend"><i class="fas fa-user-friends"></i><h3>👨‍❤️‍👨 Add Boyfriend</h3></div>
<div class="tool-card" data-tool="girlfriend"><i class="fas fa-user-friends"></i><h3>👩‍❤️‍👨 Add Girlfriend</h3></div>
<div class="tool-card" data-tool="merge"><i class="fas fa-heart"></i><h3>💑 Merge as Couple</h3></div>
<div class="tool-card" data-tool="painting"><i class="fas fa-palette"></i><h3>🎨 Oil Painting</h3></div>
<div class="tool-card" data-tool="pencil"><i class="fas fa-pen-fancy"></i><h3>✏️ Pencil Drawing</h3></div>
<div class="tool-card" data-tool="changebg"><i class="fas fa-image"></i><h3>🌄 Change BG</h3></div>
</div>
<div id="styleSelector" style="display:none"><div class="style-options" id="styleOptions"></div></div>
<div class="preview-area"><div class="preview-box" id="previewBox"><div style="color:#FFD700;"><i class="fas fa-cloud-upload-alt" style="font-size:3rem"></i><p>Your result will appear here</p></div></div></div>
<div id="singleUpload"><div class="upload-area" id="uploadZone"><i class="fas fa-cloud-upload-alt"></i><p><strong>CLICK OR DRAG & DROP</strong><br>Your Photo</p><input type="file" id="imageInput" accept="image/*" style="display:none"></div></div>
<div id="doubleUpload" style="display:none"><div class="double-upload"><div class="upload-box" id="uploadZone1"><i class="fas fa-user"></i><p>IMAGE 1</p><input type="file" id="input1" accept="image/*" style="display:none"></div><div class="upload-box" id="uploadZone2"><i class="fas fa-user"></i><p>IMAGE 2</p><input type="file" id="input2" accept="image/*" style="display:none"></div></div></div>
<div class="status" id="status">⚡ Select a tool & upload photo ⚡</div>
<button class="glow-button" id="processBtn" disabled><i class="fas fa-magic"></i> PROCESS IMAGE <i class="fas fa-magic"></i></button>
<div class="loading" id="loading"><div class="spinner"></div><p>MISS ALIYA IS WORKING...</p></div>
<div class="result-card" id="resultCard"><h3>✅ IMAGE PROCESSED!</h3><img class="result-image" id="resultImage"><br><a href="#" id="downloadLink" class="download-btn" download="processed.png"><i class="fas fa-download"></i> DOWNLOAD</a></div>
<div class="footer"><i class="fas fa-heart" style="color:#FF6B6B"></i> CREATED WITH ATTITUDE BY MISS ALIYA <i class="fas fa-heart" style="color:#FF6B6B"></i></div></div></div>
<script>
let selectedTool=null;
let singleImage=null;
let image1=null,image2=null;
let selectedStyle=null;

const styleOptions = {
    cartoon: ['disney','anime','comic','sketch','watercolor'],
    changebg: ['beach','forest','city','romantic','white']
};

document.querySelectorAll('.tool-card').forEach(card=>{card.onclick=()=>{document.querySelectorAll('.tool-card').forEach(c=>c.classList.remove('selected'));card.classList.add('selected');selectedTool=card.dataset.tool;selectedStyle=null;singleImage=null;image1=image2=null;document.getElementById('previewBox').innerHTML='<div style="color:#FFD700;"><i class="fas fa-cloud-upload-alt" style="font-size:3rem"></i><p>Your result will appear here</p></div>';document.getElementById('resultCard').style.display='none';
if(styleOptions[selectedTool]){let html='';styleOptions[selectedTool].forEach(s=>{html+='<button class="style-btn" data-style="'+s+'">'+s.toUpperCase()+'</button>';});document.getElementById('styleOptions').innerHTML=html;document.getElementById('styleSelector').style.display='block';document.querySelectorAll('.style-btn').forEach(btn=>{btn.onclick=()=>{document.querySelectorAll('.style-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');selectedStyle=btn.dataset.style;checkReady();};});}else{document.getElementById('styleSelector').style.display='none';}
const needTwo=['faceswap','merge'].includes(selectedTool);document.getElementById('singleUpload').style.display=needTwo?'none':'block';document.getElementById('doubleUpload').style.display=needTwo?'block':'none';checkReady();};});

const zone=document.getElementById('uploadZone'),input=document.getElementById('imageInput');
zone.onclick=()=>input.click();
zone.ondragover=e=>{e.preventDefault();zone.style.borderColor='#FFD700';};
zone.ondragleave=()=>{zone.style.borderColor='rgba(255,215,0,0.4)';};
zone.ondrop=e=>{e.preventDefault();zone.style.borderColor='rgba(255,215,0,0.4)';const f=e.dataTransfer.files[0];if(f&&f.type.startsWith('image/'))handleSingle(f);};
input.onchange=e=>{if(e.target.files[0])handleSingle(e.target.files[0]);};

function handleSingle(file){singleImage=file;document.getElementById('status').innerHTML='✅ '+file.name.slice(0,30);const reader=new FileReader();reader.onload=ev=>{document.getElementById('previewBox').innerHTML='<img src="'+ev.target.result+'" class="preview-image">';};reader.readAsDataURL(file);checkReady();}

const z1=document.getElementById('uploadZone1'),z2=document.getElementById('uploadZone2'),i1=document.getElementById('input1'),i2=document.getElementById('input2');
if(z1){z1.onclick=()=>i1.click();z1.ondrop=e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleImage1(f);};}
if(z2){z2.onclick=()=>i2.click();z2.ondrop=e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleImage2(f);};}
i1.onchange=e=>{if(e.target.files[0])handleImage1(e.target.files[0]);};
i2.onchange=e=>{if(e.target.files[0])handleImage2(e.target.files[0]);};

function handleImage1(file){image1=file;updateDoublePreview();checkReady();}
function handleImage2(file){image2=file;updateDoublePreview();checkReady();}
function updateDoublePreview(){let html='';if(image1){const r=new FileReader();r.onload=ev=>{document.getElementById('previewBox').innerHTML='<img src="'+ev.target.result+'" class="preview-image">'+(image2?'<img src="[OBJECT]" class="preview-image">':'');};r.readAsDataURL(image1);}if(image2){const r=new FileReader();r.onload=ev=>{document.getElementById('previewBox').innerHTML=(image1?'<img src="[OBJECT]" class="preview-image">':'')+'<img src="'+ev.target.result+'" class="preview-image">';};r.readAsDataURL(image2);}}

function checkReady(){let ready=false;if(['faceswap','merge'].includes(selectedTool)){ready=selectedTool&&image1&&image2;}else if(['cartoon','removewatermark','sketch','removebg','painting','pencil'].includes(selectedTool)){ready=selectedTool&&singleImage;}else if(['boyfriend','girlfriend'].includes(selectedTool)){ready=selectedTool&&singleImage;}else if(selectedTool==='changebg'){ready=selectedTool&&singleImage&&selectedStyle;}document.getElementById('processBtn').disabled=!ready;}

document.getElementById('processBtn').onclick=async()=>{if(!selectedTool)return;const fd=new FormData();if(['faceswap','merge'].includes(selectedTool)){if(!image1||!image2)return;fd.append('image1',image1);fd.append('image2',image2);}else{fd.append('image1',singleImage);}fd.append('tool',selectedTool);if(selectedStyle)fd.append('style',selectedStyle);document.getElementById('processBtn').disabled=true;document.getElementById('loading').style.display='block';document.getElementById('resultCard').style.display='none';try{const resp=await fetch('/process',{method:'POST',body:fd});if(!resp.ok)throw new Error('Processing failed');const blob=await resp.blob();const url=URL.createObjectURL(blob);document.getElementById('resultImage').src=url;document.getElementById('downloadLink').href=url;document.getElementById('resultCard').style.display='block';}catch(e){alert('Error: '+e.message);}finally{document.getElementById('processBtn').disabled=false;document.getElementById('loading').style.display='none';}};
</script>
</body>
</html>`);
});

app.post('/process', upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), async (req, res) => {
    try {
        const tool = req.body.tool;
        const style = req.body.style;
        const file1 = req.files['image1'] ? req.files['image1'][0] : null;
        const file2 = req.files['image2'] ? req.files['image2'][0] : null;
        
        if (!file1) throw new Error('No image provided');
        
        let outputPath;
        
        if (tool === 'cartoon') {
            outputPath = await toCartoon(file1.path, style || 'disney');
        } else if (tool === 'faceswap') {
            if (!file2) throw new Error('Need 2 images for face swap');
            outputPath = await faceSwap(file1.path, file2.path);
            try { fs.unlinkSync(file2.path); } catch(e) {}
        } else if (tool === 'removewatermark') {
            outputPath = await removeWatermark(file1.path);
        } else if (tool === 'sketch') {
            outputPath = await toSketch(file1.path);
        } else if (tool === 'removebg') {
            outputPath = await removeBackground(file1.path);
        } else if (tool === 'boyfriend') {
            outputPath = await addPartner(file1.path, 'boyfriend');
        } else if (tool === 'girlfriend') {
            outputPath = await addPartner(file1.path, 'girlfriend');
        } else if (tool === 'merge') {
            if (!file2) throw new Error('Need 2 images to merge');
            outputPath = await mergePhotos(file1.path, file2.path);
            try { fs.unlinkSync(file2.path); } catch(e) {}
        } else if (tool === 'painting') {
            outputPath = await toOilPainting(file1.path);
        } else if (tool === 'pencil') {
            outputPath = await toPencil(file1.path);
        } else if (tool === 'changebg') {
            outputPath = await changeBackground(file1.path, style || 'beach');
        } else {
            throw new Error('Unknown tool');
        }
        
        res.sendFile(path.resolve(outputPath), () => {
            try { fs.unlinkSync(file1.path); } catch(e) {}
            try { fs.unlinkSync(outputPath); } catch(e) {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => console.log('👑 MISS ALIYA PHOTO STUDIO running on', PORT));
