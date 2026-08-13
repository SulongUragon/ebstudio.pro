import type { ComicPanel, VisualBookPage, VisualBookProject } from "./visual-book-types";
import { visualProjectFilename } from "./visual-book-utils";
const W = 1200, H = 1800, PAPER = "#f7f2e8", INK = "#171916", RUST = "#a95234";

export async function exportVisualPdf(project: VisualBookProject) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [W, H] });
  for (let i = 0; i < project.pages.length; i++) { if (i) pdf.addPage([W, H], "portrait"); pdf.addImage(await renderVisualPage(project, project.pages[i]), "JPEG", 0, 0, W, H, undefined, "FAST"); }
  pdf.save(visualProjectFilename(project.title, "Visual-Edition.pdf"));
}
export async function exportVisualPagesZip(project: VisualBookProject) {
  const JSZip = (await import("jszip")).default; const zip = new JSZip();
  for (const page of project.pages) zip.file(`page-${String(page.pageNumber).padStart(2, "0")}.jpg`, (await renderVisualPage(project, page)).split(",")[1], { base64: true });
  zip.file("storyboard.json", JSON.stringify({ ...project, pages: project.pages.map(stripImages) }, null, 2));
  downloadBlob(await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 7 } }), visualProjectFilename(project.title, "Page-Images.zip"));
}
export async function exportVisualPageJpeg(project: VisualBookProject, page: VisualBookPage) { const a = document.createElement("a"); a.href = await renderVisualPage(project, page); a.download = visualProjectFilename(project.title, `Page-${String(page.pageNumber).padStart(2, "0")}.jpg`); a.click(); }

export async function renderVisualPage(project: VisualBookProject, page: VisualBookPage) {
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H; const c = canvas.getContext("2d"); if (!c) throw new Error("This browser could not render the visual page."); c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
  if (project.mode === "comic") await drawComic(c, project, page); else await drawVisual(c, project, page); return canvas.toDataURL("image/jpeg", .92);
}
async function drawVisual(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  const bleed = page.role === "cover" || page.layout === "full-bleed";
  if (bleed) { await imageCover(c, page.imageData, 0, 0, W, H, "#253d33"); const g = c.createLinearGradient(0, H * .35, 0, H); g.addColorStop(0, "rgba(5,9,8,.03)"); g.addColorStop(1, "rgba(5,9,8,.88)"); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = "#fffaf0"; c.font = "700 86px Georgia"; const y = H - (page.body ? 370 : 280); wrap(c, page.role === "cover" ? project.title : page.title, 105, y, 990, 98, 4); c.font = "32px Arial"; wrap(c, page.role === "cover" ? project.subtitle : page.body, 108, y + 215, 930, 48, 4); c.font = "700 25px Arial"; c.fillText(page.role === "cover" ? project.author.toUpperCase() : String(page.pageNumber), 108, H - 90); return; }
  c.fillStyle = INK; c.font = "700 25px Arial"; c.fillText(project.title.toUpperCase(), 76, 72); c.fillStyle = RUST; c.fillRect(76, 98, 1048, 3);
  if (page.layout === "image-top" || page.layout === "quote") { await imageCover(c, page.imageData, 76, 145, 1048, 720, "#d8d0c3"); c.fillStyle = INK; c.font = "700 67px Georgia"; const y = wrap(c, page.title, 76, 965, 1048, 78, 4); c.fillStyle = "#393a36"; c.font = "31px Arial"; wrap(c, page.body, 76, y + 50, 1048, 49, 11); }
  else { const left = page.layout === "image-left", ix = left ? 76 : 646, tx = left ? 646 : 76; await imageCover(c, page.imageData, ix, 145, 478, 1480, "#d8d0c3"); c.fillStyle = INK; c.font = "700 64px Georgia"; const y = wrap(c, page.title, tx, 220, 478, 76, 6); c.fillStyle = "#393a36"; c.font = "31px Arial"; wrap(c, page.body, tx, y + 55, 478, 50, 19); }
  c.fillStyle = "#5e5c55"; c.font = "700 23px Arial"; c.fillText(String(page.pageNumber), 1080, 1730);
}
async function drawComic(c: CanvasRenderingContext2D, project: VisualBookProject, page: VisualBookPage) {
  if (page.role === "cover") { await imageCover(c, page.panels[0]?.imageData ?? page.imageData, 0, 0, W, H, "#17211d"); const g = c.createLinearGradient(0, H * .36, 0, H); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.91)"); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = "#fff9ed"; c.font = "700 96px Georgia"; wrap(c, project.title, 88, 1270, 1024, 105, 4); c.font = "700 27px Arial"; c.fillText(project.author.toUpperCase(), 92, 1708); return; }
  c.fillStyle = "#121413"; c.fillRect(0, 0, W, H); const panels = page.panels.length ? page.panels : [emptyPanel()]; const boxes = panelBoxes(panels.length);
  for (let i = 0; i < panels.length; i++) { const p = panels[i], b = boxes[i]; await imageCover(c, p.imageData, b.x, b.y, b.w, b.h, "#2e3330"); c.strokeStyle = "#f8f1e5"; c.lineWidth = 10; c.strokeRect(b.x, b.y, b.w, b.h); panelWords(c, p, b); }
  c.fillStyle = "#f8f1e5"; c.font = "700 23px Arial"; c.fillText(`${page.pageNumber}  ${page.title}`.toUpperCase(), 46, 1762);
}
function panelWords(c: CanvasRenderingContext2D, p: ComicPanel, b: {x:number;y:number;w:number;h:number}) { let y = b.y + 24; for (const line of p.dialogue.slice(0,3)) { const text = line.speaker ? `${line.speaker.toUpperCase()}: ${line.text}` : line.text, bh = Math.min(176, 58 + Math.ceil(text.length / 28) * 29); c.fillStyle = "rgba(255,255,255,.94)"; c.beginPath(); c.roundRect(b.x+24,y,Math.min(b.w-48,430),bh,26); c.fill(); c.fillStyle="#141514"; c.font="700 23px Arial"; wrap(c,text,b.x+46,y+37,Math.min(b.w-92,384),29,5); y += bh+15; } if(p.caption){c.fillStyle="rgba(248,235,191,.94)";c.fillRect(b.x+24,b.y+b.h-100,b.w-48,74);c.fillStyle="#171817";c.font="italic 21px Georgia";wrap(c,p.caption,b.x+40,b.y+b.h-71,b.w-80,27,2);} if(p.soundEffect){c.save();c.translate(b.x+b.w-36,b.y+b.h*.55);c.rotate(-.13);c.textAlign="right";c.font="900 53px Arial";c.lineWidth=11;c.strokeStyle="#111";c.strokeText(p.soundEffect.toUpperCase(),0,0);c.fillStyle="#f5b541";c.fillText(p.soundEffect.toUpperCase(),0,0);c.restore();} }
function panelBoxes(count:number){const gap=22,m=38,uw=W-m*2,uh=H-120;if(count<=1)return[{x:m,y:34,w:uw,h:uh}];if(count===2){const h=(uh-gap)/2;return[0,1].map(i=>({x:m,y:34+i*(h+gap),w:uw,h}));}if(count===3){const th=uh*.54,bh=uh-th-gap;return[{x:m,y:34,w:uw,h:th},{x:m,y:34+th+gap,w:(uw-gap)/2,h:bh},{x:m+(uw+gap)/2,y:34+th+gap,w:(uw-gap)/2,h:bh}];}const w=(uw-gap)/2,h=(uh-gap)/2;return[0,1,2,3].map(i=>({x:m+(i%2)*(w+gap),y:34+Math.floor(i/2)*(h+gap),w,h}));}
async function imageCover(c:CanvasRenderingContext2D,data:string|undefined,x:number,y:number,w:number,h:number,fallback:string){c.fillStyle=fallback;c.fillRect(x,y,w,h);if(!data){c.fillStyle="rgba(255,255,255,.42)";c.font="700 24px Arial";c.textAlign="center";c.fillText("IMAGE PENDING",x+w/2,y+h/2);c.textAlign="left";return;}const im=await loadImage(data),scale=Math.max(w/im.width,h/im.height),sw=w/scale,sh=h/scale;c.drawImage(im,(im.width-sw)/2,(im.height-sh)/2,sw,sh,x,y,w,h);}
function wrap(c:CanvasRenderingContext2D,text:string,x:number,y:number,max:number,lh:number,limit:number){const words=String(text).replace(/\s+/g," ").trim().split(" ").filter(Boolean),lines:string[]=[];let line="";for(const word of words){const test=line?`${line} ${word}`:word;if(c.measureText(test).width>max&&line){lines.push(line);line=word;if(lines.length===limit)break;}else line=test;}if(line&&lines.length<limit)lines.push(line);lines.forEach((s,i)=>c.fillText(s,x,y+i*lh));return y+lines.length*lh;}
function loadImage(data:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error("A page image could not be rendered."));im.src=data;});}
function emptyPanel():ComicPanel{return{id:"empty",order:1,scene:"",camera:"",dialogue:[],caption:"",soundEffect:""};}
function stripImages(page:VisualBookPage){return{...page,imageData:undefined,panels:page.panels.map(p=>({...p,imageData:undefined}))};}
function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
