export type DesktopCell = { col:number; row:number };
export type DesktopPositions = Record<string,DesktopCell>;
export type DesktopGrid = { cols:number; rows:number };
const same=(a:DesktopCell,b:DesktopCell)=>a.col===b.col&&a.row===b.row;
const valid=(v:unknown):v is DesktopCell=>!!v&&typeof v==='object'&&Number.isInteger((v as DesktopCell).col)&&Number.isInteger((v as DesktopCell).row)&&(v as DesktopCell).col>=0&&(v as DesktopCell).row>=0&&(v as DesktopCell).col<1000&&(v as DesktopCell).row<1000;
export const clampCell=(cell:DesktopCell,grid:DesktopGrid):DesktopCell=>({col:Math.max(0,Math.min(grid.cols-1,Math.round(cell.col))),row:Math.max(0,Math.min(grid.rows-1,Math.round(cell.row)))});
export function readDesktopPositions(storage:Storage,key:string):DesktopPositions {
  try { const raw=JSON.parse(storage.getItem(key)||'{}'); if(!raw||typeof raw!=='object'||Array.isArray(raw))return {}; return Object.fromEntries(Object.entries(raw).filter(([id,v])=>/^[a-z0-9-]{1,80}$/.test(id)&&valid(v))) as DesktopPositions; }catch{return {};}
}
export function arrangeDesktop(ids:string[],saved:DesktopPositions,grid:DesktopGrid,rowFirst=false):DesktopPositions {
  const cols=Math.max(1,grid.cols),rows=Math.max(Math.ceil(ids.length/cols),grid.rows,1);
  const result:DesktopPositions=Object.create(null);
  const used=new Set<string>(); const tag=(c:DesktopCell)=>c.col+':'+c.row;
  for(const id of ids){const cell=saved[id];if(valid(cell)&&cell.col<cols&&cell.row<rows&&!used.has(tag(cell))){result[id]={...cell};used.add(tag(cell));}}
  for(const id of ids){if(result[id])continue;for(let n=0;n<cols*rows;n++){const cell=rowFirst?{col:n%cols,row:Math.floor(n/cols)}:{col:Math.floor(n/rows),row:n%rows};if(!used.has(tag(cell))){result[id]=cell;used.add(tag(cell));break;}}}
  return result;
}
export function moveDesktopIcon(layout:DesktopPositions,id:string,target:DesktopCell,grid:DesktopGrid):DesktopPositions {
  if(!Object.hasOwn(layout,id))return layout;
  const origin=layout[id],next=clampCell(target,grid);if(same(origin,next))return layout;
  const occupant=Object.keys(layout).find(other=>other!==id&&same(layout[other],next));
  return {...layout,[id]:next,...(occupant?{[occupant]:{...origin}}:{})};
}
