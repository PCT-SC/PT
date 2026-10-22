(() => {
  'use strict';
  // Standalone, local-only export. No network requests, report details or telemetry.
  const $ = id => document.getElementById(id);
  const INTRO = 'إلى من يهمه الأمر\n\nالسلام عليكم ورحمة الله وبركاته،\n\nبعد الاطلاع على صور الأقمار الصناعية وتحليل البيانات ذات الصلة، والاستناد إلى ما توفر لدينا من معلومات ومعطيات، نرفع إلى مقامكم هذه الإفادة بشأن عدد من المواقع، مرفقة بإحداثياتها وصورها والملاحظات المرتبطة بها، والتي نرى أنها تستدعي عنايتكم واهتمامكم العاجل، آملين التكرم بدراستها والتحقق مما ورد فيها، واتخاذ ما ترونه مناسبًا حيالها.\n\nخُصصت صفحة مستقلة لكل موقع، تتضمن إحداثياته وصورته وتعليقًا مختصرًا يوضح الملاحظات ذات الصلة.';
  const CLOSING = 'وتفضلوا بقبول فائق الاحترام والتقدير.';
  const SUBJECT = 'إفادة بشأن عدة مواقع ميدانية حساسة';
  const utf8 = text => new TextEncoder().encode(String(text));
  const text = v => String(v ?? '');
  const xml = v => text(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  const html = v => text(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const safeFile = str => text(str).replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0,100);
  const pad = n => String(n).padStart(2,'0');
  const today = () => {const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
  const dateDisplay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g,'/') : text(value);
  function center(place) {
    let lat = Number(place?.center?.lat ?? place?.display_center?.lat);
    let lon = Number(place?.center?.lon ?? place?.center?.lng ?? place?.display_center?.lon);
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && place?.geometry?.type === 'Point') {
      lon = Number(place.geometry.coordinates?.[0]); lat = Number(place.geometry.coordinates?.[1]);
    }
    return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? {lat,lon} : null;
  }
  function coordText(place) {
    const c = center(place);
    if (!c) return 'غير متوفرة';
    return `${Math.abs(c.lat).toFixed(6)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lon).toFixed(6)}° ${c.lon >= 0 ? 'E' : 'W'}`;
  }
  const validSources = item => Array.isArray(item?.sources) ? item.sources.map(s => typeof s === 'string' ? s.trim() : text(s?.url).trim()).filter(Boolean) : [];
  function blobToDataUrl(blob) {
    return new Promise((resolve,reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error('Could not read local attachment.'));
      fr.readAsDataURL(blob);
    });
  }
  function decodeImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('Image could not be decoded'));
      img.src = url;
    });
  }
  async function convertBlobToJpeg(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await decodeImage(url);
      const shrink = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1,Math.round(img.naturalWidth * shrink));
      const height = Math.max(1,Math.round(img.naturalHeight * shrink));
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,width,height); ctx.drawImage(img,0,0,width,height);
      return await new Promise((resolve,reject) => canvas.toBlob(out => out ? resolve({blob:out,width,height}) : reject(new Error('Image conversion failed')), 'image/jpeg', .83));
    } finally { URL.revokeObjectURL(url); }
  }
  async function videoPoster(blob) {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.preload = 'auto'; video.muted = true; video.playsInline = true;
    try {
      await new Promise((resolve,reject) => {
        const deadline = setTimeout(() => reject(new Error('Video preview timed out')), 7000);
        let done = false;
        function finish(err) { if(done)return; done=true;clearTimeout(deadline); video.onloadeddata=null;video.onseeked=null;video.onerror=null;err?reject(err):resolve(); }
        video.onerror = () => finish(new Error('Video cannot be decoded'));
        video.onloadeddata = () => {
          try { if (Number.isFinite(video.duration) && video.duration > .25) {video.onseeked = () => finish(); video.currentTime = Math.min(1,video.duration/4);} else finish(); }
          catch { finish(); }
        };
        video.src = url; video.load();
      });
      if (!video.videoWidth || !video.videoHeight) throw new Error('No video preview available');
      const shrink = Math.min(1, 1100 / Math.max(video.videoWidth,video.videoHeight));
      const width = Math.max(1,Math.round(video.videoWidth * shrink));
      const height = Math.max(1,Math.round(video.videoHeight * shrink));
      const canvas = document.createElement('canvas'); canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('Canvas unavailable');
      ctx.drawImage(video,0,0,width,height);
      const poster = await new Promise((resolve,reject) => canvas.toBlob(b => b?resolve(b):reject(new Error('Video thumbnail failed')),'image/jpeg',.8));
      return {blob:poster,width,height};
    } finally {video.pause();video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
  }
  async function prepareMedia(place) {
    const result = [];
    for (const item of Array.isArray(place.attachments) ? place.attachments : []) {
      const entry = await window.FALocalStore.readAttachment(item.id);
      const filename = text(item.name || entry?.name || 'Attachment');
      const mime = text(entry?.type || item.type || '').toLowerCase();
      const kind = mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : 'other';
      if (!entry?.blob) {result.push({name:filename,kind,missing:true});continue;}
      try {
        if(kind==='image' || kind==='video') {
          const preview = kind==='video' ? await videoPoster(entry.blob) : await convertBlobToJpeg(entry.blob);
          result.push({name:filename,kind,blob:preview.blob,width:preview.width,height:preview.height,dataUrl:await blobToDataUrl(preview.blob)});
        } else result.push({name:filename,kind});
      } catch { result.push({name:filename,kind,missing:true}); }
    }
    return result;
  }
  async function prepareReport(records, details) {
    const active = (records || []).filter(p => !p.deleted && !p.deleted_at);
    const places=[];
    for (const place of active) places.push({...place,reportMedia:await prepareMedia(place)});
    return {places,details};
  }

  // RFC 1952/ZIP store-only writer. Word accepts stored ZIP entries; JPEGs are already compressed.
  function crc32(buf) {let crc=0xffffffff; for(const b of buf){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
  function u16(n){return [n&255,(n>>>8)&255];}
  function u32(n){return [n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
  function makeZip(entries) {
    const parts=[], directory=[]; let pos=0;
    for(const [name,bytes] of entries) {
      const filename=utf8(name); const data=bytes instanceof Uint8Array?bytes:utf8(bytes);
      const crc=crc32(data); const flags=0x0800;
      const local=new Uint8Array([80,75,3,4,...u16(20),...u16(flags),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0)]);
      parts.push(local,filename,data);
      directory.push(new Uint8Array([80,75,1,2,...u16(20),...u16(20),...u16(flags),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(filename.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(pos)]),filename);
      pos+=local.length+filename.length+data.length;
    }
    const centralSize=directory.reduce((acc,entry)=>acc+entry.length,0);
    const end=new Uint8Array([80,75,5,6,...u16(0),...u16(0),...u16(entries.length),...u16(entries.length),...u32(centralSize),...u32(pos),...u16(0)]);
    return new Blob([...parts,...directory,end],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  }
  function wordRun(value, bold=false, ltr=false) {
    const rpr='<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>'+ (ltr?'<w:rtl w:val="0"/><w:lang w:val="en-US"/>':'<w:rtl w:val="1"/><w:lang w:bidi="ar-SA"/>')+(bold?'<w:b/><w:bCs/>':'');
    return `<w:r><w:rPr>${rpr}</w:rPr><w:t xml:space="preserve">${xml(value)}</w:t></w:r>`;
  }
  function wordParagraph(value, {bold=false, align='right',rtl=true, space=170,breakBefore=false}={}) {
    const lines=text(value).split(/\r?\n/);
    let runs=lines.map((line,i)=>(i?'<w:r><w:br/></w:r>':'')+wordRun(line,bold,!rtl)).join('');
    if (!runs) runs=wordRun(' ');
    return `<w:p><w:pPr>${rtl?'<w:bidi/>':'<w:bidi w:val="0"/>'}<w:jc w:val="${rtl && align==='right'?'left':align}"/><w:spacing w:before="90" w:after="${space}"/>${breakBefore?'<w:pageBreakBefore/>':''}</w:pPr>${runs}</w:p>`;
  }
  function wordNotes(notes) {
    const value=text(notes||'لا توجد ملاحظات.');
    const notesRuns=value.split(/\r?\n/).map((line,i)=>(i?'<w:r><w:br/></w:r>':'')+wordRun(line,false)).join('');
    return `<w:p><w:pPr><w:bidi/><w:jc w:val="left"/><w:spacing w:before="200" w:after="280"/></w:pPr>${wordRun('ملاحظة: ',true)}${notesRuns}</w:p>`;
  }
  // Both fields: Arabic label first, then the bold value directly underneath.
  // The coordinate field remains in the left column, but its LTR numbers align right.
  function wordLocationTable(place) {
    const borders = '<w:tblBorders><w:top w:val="single" w:sz="6" w:color="AAAAAA"/><w:bottom w:val="single" w:sz="6" w:color="AAAAAA"/><w:left w:val="single" w:sz="6" w:color="AAAAAA"/><w:right w:val="single" w:sz="6" w:color="AAAAAA"/><w:insideV w:val="single" w:sz="6" w:color="AAAAAA"/></w:tblBorders>';
    const labelLine = str => wordParagraph(str, {bold:true,rtl:true,align:'right',space:55});
    const valueLine = (str,ltr) => wordParagraph(str, {bold:true,rtl:!ltr,align:'right',space:85});
    const cell = (label,value,ltr=false) => `<w:tc><w:tcPr><w:tcW w:w="4650" w:type="dxa"/><w:vAlign w:val="center"/><w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="65" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${labelLine(label)}${valueLine(value,ltr)}</w:tc>`;
    // bidiVisual renders the first cell on the right in Word and LibreOffice.
    return `<w:tbl><w:tblPr><w:tblW w:w="9300" w:type="dxa"/><w:bidiVisual/>${borders}</w:tblPr><w:tr><w:trPr><w:cantSplit/></w:trPr>${cell('المنطقة',text(place.area_name).trim()||'غير متوفرة')}${cell('الإحداثيات',coordText(place),true)}</w:tr></w:tbl>`;
  }
  function wordImage(rid,index,media) {
    const maxW=5200000,maxH=4500000,ratio=Math.min(maxW/Math.max(1,media.width),maxH/Math.max(1,media.height));
    const w=Math.round(media.width*ratio),h=Math.round(media.height*ratio);
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${index}" name="Attachment ${index}" descr="${xml(media.name)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${index}" name="Attachment ${index}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }
  async function exportWord(report) {
    const {details,places}=report;
    const sections=[],images=[];let imageCounter=0;
    sections.push(wordParagraph(`التاريخ: ${dateDisplay(details.date)}`,{bold:true}));
    sections.push(wordParagraph(`الموضوع: ${details.subject}`,{bold:true,space:500}));
    for(const line of details.intro.split(/\n\n+/))sections.push(wordParagraph(line,{space:380}));
    if(details.sender)sections.push(wordParagraph(`الاسم: ${details.sender}`,{bold:true}));
    if(details.contact)sections.push(wordParagraph(`وسيلة التواصل: ${details.contact}`,{bold:true}));
    sections.push(wordParagraph(' ',{breakBefore:false,space:100}));
    for(let i=0;i<places.length;i++) {
      const place=places[i];
      sections.push(wordParagraph(`${i+1}. ${place.name || 'موقع بدون اسم'}`,{bold:true,space:260,breakBefore:true}));
      sections.push(wordLocationTable(place));
      for(const media of place.reportMedia) {
        if(media.blob) {
          const id=++imageCounter;
          const bytes=new Uint8Array(await media.blob.arrayBuffer());
          images.push({id,bytes});
          sections.push(wordImage(`rIdImg${id}`,id,media));
        }
        sections.push(wordParagraph(`${media.kind === 'video' ? 'فيديو' : 'مرفق'}: ${media.name}${media.missing?' (تعذر إنشاء المعاينة)':''}`,{space:140}));
      }
      sections.push(wordNotes(place.notes));
      const sources=validSources(place);
      if(sources.length) {
        sections.push(wordParagraph('المصادر:',{bold:true,space:120}));
        for (let s=0;s<sources.length;s++) sections.push(wordParagraph(`${s+1}. ${sources[s]}`,{rtl:false,align:'left',space:80}));
      }
    }
    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${sections.join('')}<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1100" w:right="1220" w:bottom="1150" w:left="1220" w:header="600" w:footer="600" w:gutter="0"/></w:sectPr></w:body></w:document>`;
    const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${images.map(img=>`<Relationship Id="rIdImg${img.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${img.id}.jpg"/>`).join('')}</Relationships>`;
    const footer=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
    const files=[
      ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml',`<?xml version="1.0" encoding="UTF-8"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Project Tracker - Research Report</dc:title><dc:creator>Project Tracker</dc:creator></cp:coreProperties>`],
      ['word/document.xml',documentXml],
      ['word/_rels/document.xml.rels',rels],
      ['word/footer1.xml',footer],
      ['word/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`]
    ];
    for(const image of images)files.push([`word/media/image${image.id}.jpg`,image.bytes]);
    const blob=makeZip(files);download(blob,`project-tracker-report-${details.date}.docx`);
  }
  function download(blob, filename) {
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=safeFile(filename);a.style.display='none';document.body.appendChild(a);a.click();
    setTimeout(()=>{a.remove();URL.revokeObjectURL(url);},10000);
  }
  function reportHtml(report) {
    const {details,places}=report;
    const cover = `<section class="cover"><p class="date"><b>التاريخ: ${html(dateDisplay(details.date))}</b></p><p class="subject"><b>الموضوع: ${html(details.subject)}</b></p><div class="intro">${details.intro.split(/\n\n+/).map(part=>`<p>${html(part).replace(/\n/g,'<br>')}</p>`).join('')}</div>${details.sender?`<p><b>الاسم: ${html(details.sender)}</b></p>`:''}${details.contact?`<p><b>وسيلة التواصل: ${html(details.contact)}</b></p>`:''}</section>`;
    const body=places.map((p,i)=>{
      const files=(p.reportMedia||[]).map(m=>`<figure>${m.dataUrl?`<img src="${m.dataUrl}" alt="${html(m.name)}">`:''}<figcaption>${m.kind==='video'?'فيديو: ':'مرفق: '}${html(m.name)}${m.missing?' (معاينة غير متوفرة)':''}</figcaption></figure>`).join('');
      const sources=validSources(p).map(src=>`<li dir="ltr">${html(src)}</li>`).join('');
      const area=html(text(p.area_name).trim()||'غير متوفرة');
      const fields=`<div class="location-fields"><div class="location-field coordinates"><div class="location-label">الإحداثيات</div><div class="location-value" dir="ltr">${html(coordText(p))}</div></div><div class="location-field area"><div class="location-label">المنطقة</div><div class="location-value" dir="rtl">${area}</div></div></div>`;
      return `<section class="poi"><h2>${i+1}. ${html(p.name||'موقع بدون اسم')}</h2>${fields}<div class="attachments">${files}</div><p class="notes"><b>ملاحظة:</b> ${html(p.notes||'لا توجد ملاحظات.').replace(/\n/g,'<br>')}</p>${sources?`<div class="sources"><b>المصادر:</b><ol>${sources}</ol></div>`:''}</section>`;
    }).join('');
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير المواقع - Project Tracker</title><style>
      @page { size:A4; margin:20mm 18mm 19mm; @bottom-center { content: counter(page); font-size:10pt; font-family:Arial,sans-serif; color:#333; } }
      *{box-sizing:border-box}body{font-family:Arial,Tahoma,'Noto Naskh Arabic',sans-serif;font-size:12pt;line-height:1.9;color:#121212;background:white;direction:rtl;margin:0;text-align:right}
      /* Avoid a blank page between the cover and the first POI.
         Exactly one page break follows the cover; only later POIs start new pages. */
      .cover{break-after:page;page-break-after:always;padding-top:5mm;margin:0}
      .cover .date{text-align:right;margin-bottom:32px}.cover .subject{margin:26px 0}.cover .intro{margin:32px 0}.cover .intro p{margin:0 0 25px}.cover>p{margin-top:14px}
      .poi{padding-top:5mm;break-before:auto;page-break-before:auto}
      .poi + .poi{break-before:page;page-break-before:always}
      h2{font-size:14pt;margin:8px 0 17px;font-weight:bold}
      .location-fields{display:grid;grid-template-columns:1fr 1fr;direction:ltr;width:100%;border:1px solid #888;margin-bottom:24px;break-inside:avoid}
      .location-field{min-width:0;padding:9px 12px 8px;display:flex;flex-direction:column;justify-content:center;gap:2px}
      .location-field + .location-field{border-left:1px solid #888}
      .location-value{font-size:11pt;font-weight:700;line-height:1.6;overflow-wrap:anywhere}
      .coordinates .location-value{text-align:right;direction:ltr;unicode-bidi:isolate}
      .area .location-value{text-align:right;direction:rtl}
      .location-label{font-size:10pt;font-weight:700;line-height:1.5;color:#333;direction:rtl;text-align:right}
      .coordinates .location-label{text-align:right}
      .area .location-label{text-align:right}
      .attachments{display:flex;flex-direction:column;gap:9px;align-items:center;margin:18px 0 25px}figure{margin:0 auto 8px;text-align:center;max-width:100%;break-inside:avoid}img{display:block;max-width:100%;max-height:105mm;object-fit:contain;margin:0 auto}figcaption{font-size:9pt;color:#555;max-width:140mm;overflow-wrap:anywhere}.notes{white-space:normal;overflow-wrap:anywhere;margin-top:25px}.sources{margin-top:20px}.sources li{font-family:Arial,sans-serif;overflow-wrap:anywhere;text-align:left;line-height:1.5;margin:5px 0}
      @media screen {body{max-width:210mm;margin:20px auto;padding:18mm;box-shadow:0 0 18px #bbb}.cover,.poi{border-bottom:1px dashed #999;padding-bottom:35px}}
    </style></head><body>${cover}${body}</body></html>`;
  }
  async function exportPdf(report, win) {
    if(!win||win.closed)throw new Error('Popup blocked. Allow popups for this local file, then retry.');
    win.document.open(); win.document.write(reportHtml(report)); win.document.close();
    try {
      await Promise.race([new Promise(res=>win.addEventListener('load',res,{once:true})),new Promise(res=>setTimeout(res,500))]);
      await Promise.all(Array.from(win.document.images).map(img=>img.complete?Promise.resolve():new Promise(res=>{img.onload=res;img.onerror=res;setTimeout(res,6000);}))) ;
      await win.document.fonts?.ready;
    } catch {}
    win.focus();win.print();
  }
  function setup({getPlaces,notify}) {
    let format='docx';let busy=false;
    const panel=$('report-export-panel'); if(!panel)return;
    $('report-export-date').value=today();
    $('report-export-subject').value=SUBJECT;
    $('report-export-intro').value=INTRO+'\n\n'+CLOSING;
    function open(selected){ format=selected;panel.hidden=false;$('report-export-confirm').textContent=selected==='docx'?'Create Word document':'Prepare PDF'; panel.scrollIntoView({block:'nearest',behavior:'smooth'}); }
    $('export-report-word-btn')?.addEventListener('click',()=>open('docx'));
    $('export-report-pdf-btn')?.addEventListener('click',()=>open('pdf'));
    $('report-export-cancel').addEventListener('click',()=>{if(!busy)panel.hidden=true;});
    panel.addEventListener('submit',async ev=>{
      ev.preventDefault();if(busy)return;
      // Create the browser window synchronously with the click so popup blockers permit PDF printing.
      const popup=format==='pdf'?window.open('','_blank'):null;
      if(format==='pdf'&&!popup){notify?.('Please allow popups to export a PDF.','error');return;}
      const details={date:$('report-export-date').value||today(), sender:$('report-export-name').value.trim(),contact:$('report-export-contact').value.trim(),subject:$('report-export-subject').value.trim()||SUBJECT,intro:$('report-export-intro').value.trim()||(INTRO+'\n\n'+CLOSING)};
      busy=true;const button=$('report-export-confirm');button.disabled=true;const before=button.textContent;button.textContent='Preparing report...';
      try{
        if(popup)popup.document.write('<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:Arial">Preparing report...</body></html>');
        const records=await getPlaces();
        const report=await prepareReport(records,details);
        if(format==='docx')await exportWord(report);
        else await exportPdf(report,popup);
        notify?.(`Report prepared with ${report.places.length} POIs.`, 'success');
      }catch(err){if(popup&&!popup.closed)popup.close();notify?.(`Report export failed: ${err?.message||'unknown error'}`,'error');}
      finally{busy=false;button.disabled=false;button.textContent=before;}
    });
  }
  window.PTReportExport=Object.freeze({setup,prepareReport,exportWord,reportHtml,coordText,makeZip});
})();
