import React, {useEffect,useMemo,useRef,useState} from 'react';
import type { LauncherId } from './EduWorkspace';
import { arrangeDesktop, moveDesktopIcon, type DesktopPositions, type DesktopGrid } from '../lib/desktopLayout';

const CELL_W=104,CELL_H=92;
type Drag={id:LauncherId;pointer:number;startX:number;startY:number;dx:number;dy:number;moved:boolean};
interface Props {
  pins:LauncherId[];
  positions:DesktopPositions;
  onPositions:(positions:DesktopPositions)=>void;
  launch:(id:LauncherId)=>void;
  labelFor:(id:LauncherId)=>string;
  renderIcon:(id:LauncherId)=>React.ReactNode;
}
export default function DesktopShortcuts({pins,positions,onPositions,launch,labelFor,renderIcon}:Props){
  const area=useRef<HTMLElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const [drag,setDrag]=useState<Drag|null>(null);
  const active=useRef<Drag|null>(null);
  const suppress=useRef<LauncherId|null>(null);
  const [announcement,setAnnouncement]=useState('');
  useEffect(()=>{
    const node=area.current;if(!node)return;
    const measure=()=>{const width=node.clientWidth,height=Math.max(0,window.innerHeight-node.getBoundingClientRect().top-76);setSize(old=>old.width===width&&old.height===height?old:{width,height});};
    measure();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
    observer?.observe(node);window.addEventListener('resize',measure);
    return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const cols=Math.max(1,Math.floor(size.width/CELL_W)||3);
  const rows=Math.max(1,Math.floor(size.height/CELL_H)||5,Math.ceil(pins.length/cols));
  const grid:DesktopGrid={cols,rows};
  const layout=useMemo(()=>arrangeDesktop(pins,positions,{cols,rows},size.width>0&&size.width<=640),[pins,positions,cols,rows,size.width]);
  const finish=(event:React.PointerEvent<HTMLButtonElement>,commit:boolean)=>{
    const d=active.current;if(!d||d.pointer!==event.pointerId)return;
    active.current=null;setDrag(null);
    if(d.moved){suppress.current=d.id;if(commit&&layout[d.id]){const origin=layout[d.id];const next=moveDesktopIcon(layout,d.id,{col:origin.col+Math.round(d.dx/CELL_W),row:origin.row+Math.round(d.dy/CELL_H)},grid);onPositions({...positions,...next});setAnnouncement('Đã lưu vị trí '+labelFor(d.id));}}
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <section ref={area} aria-label="Lối tắt trên màn hình nền" className="edu-desktop-shortcuts edu-desktop-movable" style={{gridTemplateColumns:'repeat('+cols+','+CELL_W+'px)',gridTemplateRows:'repeat('+rows+','+CELL_H+'px)'}}>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {pins.map(id=>{
      const cell=layout[id];if(!cell)return null;
      const moving=drag?.id===id&&drag.moved;
      return <button key={id} type="button" data-edu-launch={id} data-dragging={moving?'true':undefined}
        title={labelFor(id)+' — kéo để di chuyển; Alt + phím mũi tên để đổi vị trí'} aria-label={labelFor(id)}
        className="edu-desktop-shortcut" style={{gridColumn:cell.col+1,gridRow:cell.row+1,transform:moving&&drag?'translate('+drag.dx+'px,'+drag.dy+'px) scale(1.04)':undefined}}
        onPointerDown={e=>{
          if(e.button!==0||!e.isPrimary||active.current)return;
          suppress.current=null;const d={id,pointer:e.pointerId,startX:e.clientX,startY:e.clientY,dx:0,dy:0,moved:false};active.current=d;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e=>{
          const d=active.current;if(!d||d.id!==id||d.pointer!==e.pointerId)return;
          const dx=e.clientX-d.startX,dy=e.clientY-d.startY;
          if(!d.moved&&Math.hypot(dx,dy)<(e.pointerType==='touch'?10:6))return;
          const next={...d,moved:true,dx:Math.max(-cell.col*CELL_W,Math.min((cols-1-cell.col)*CELL_W,dx)),dy:Math.max(-cell.row*CELL_H,Math.min((rows-1-cell.row)*CELL_H,dy))};
          active.current=next;setDrag(next);
        }}
        onPointerUp={e=>finish(e,true)} onPointerCancel={e=>finish(e,false)}
        onLostPointerCapture={e=>{if(active.current?.pointer===e.pointerId){if(active.current.moved)suppress.current=id;active.current=null;setDrag(null);}}}
        onClick={e=>{if(suppress.current===id&&e.detail!==0){suppress.current=null;e.preventDefault();e.stopPropagation();return;}launch(id);}}
        onKeyDown={e=>{
          if(!e.altKey)return;const offsets:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const offset=offsets[e.key];if(!offset)return;e.preventDefault();
          onPositions({...positions,...moveDesktopIcon(layout,id,{col:cell.col+offset[0],row:cell.row+offset[1]},grid)});setAnnouncement('Đã lưu vị trí '+labelFor(id));
        }}>
        {renderIcon(id)}<span className="edu-desktop-label">{labelFor(id)}</span>
      </button>;
    })}
  </section>;
}
