import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { validWallLocation, type WallPost } from '../../lib/learningWall';

export default function WallMap({ posts, onSelect }: { posts: WallPost[]; onSelect: (id: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    if (!element.current) return;
    const instance = L.map(element.current).setView([21.6, 105.8], 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instance);
    map.current = instance; markers.current = L.layerGroup().addTo(instance);
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(element.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    const located = posts.filter(post => post.location && validWallLocation(post.location.lat, post.location.lng));
    located.forEach((post, index) => {
      const title = document.createElement('span'); title.textContent = post.title || post.studentName;
      L.marker([post.location!.lat, post.location!.lng], { icon: L.divIcon({ className: 'lw-map-marker', html: String(index + 1), iconSize: [30, 30] }), title: post.title || post.studentName })
        .bindTooltip(title).on('click', () => select.current(post.id)).addTo(markers.current!);
    });
    if (located.length) map.current.fitBounds(located.map(post => [post.location!.lat, post.location!.lng] as [number, number]), { padding: [35, 35], maxZoom: 13 });
  }, [posts]);
  return <div ref={element} className="lw-map" aria-label="Bản đồ địa điểm bài đăng" />;
}
